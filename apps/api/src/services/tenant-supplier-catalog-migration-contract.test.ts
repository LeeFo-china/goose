import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migrations = {
  catalog: new URL(
    "../../../../supabase/migrations/20260813170000_create_tenant_private_catalog.sql",
    import.meta.url,
  ),
  productScope: new URL(
    "../../../../supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql",
    import.meta.url,
  ),
  catalogCodes: new URL(
    "../../../../supabase/migrations/20260813185000_scope_catalog_codes.sql",
    import.meta.url,
  ),
  platformProduct: new URL(
    "../../../../supabase/migrations/20260813195000_allow_platform_product_write.sql",
    import.meta.url,
  ),
  compatibility: new URL(
    "../../../../supabase/migrations/20260818120000_preserve_pre_v2_supplier_catalog_boundaries.sql",
    import.meta.url,
  ),
  hardening: new URL(
    "../../../../supabase/migrations/20260818130000_harden_tenant_private_catalog_contracts.sql",
    import.meta.url,
  ),
} as const;

const expectedHistoricalHashes = {
  catalog: "203480335a963db3537012889fe9d317eec24290fbab53c0a1227df506d1c670",
  productScope:
    "77fe7e3403c670b09a72a77929c518fffac1f3c7bbb373b12092011544a133d1",
  catalogCodes:
    "d0a50ebb18395dfc071fcfc76cd889e18a005a20066488bb9fbf8d59526e82d8",
  platformProduct:
    "6934417d363c8ba82a56d000e0742e1d3df359e05e59411e3cd2c79821332e0f",
} as const;

function read(path: URL) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const hardeningSql = read(migrations.hardening);
const catalogSql = read(migrations.catalog);
const productScopeSql = read(migrations.productScope);
const catalogCodesSql = read(migrations.catalogCodes);
const platformProductSql = read(migrations.platformProduct);
const compatibilitySql = read(migrations.compatibility);
const effectiveSchemaSql = [catalogSql, compatibilitySql, hardeningSql].join("\n");

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function latestFunction(name: string) {
  const matches = Array.from(
    hardeningSql.matchAll(
      new RegExp(
        `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
        "g",
      ),
    ),
  );
  return compact(matches.at(-1)?.[0] ?? "");
}

function expectServiceRoleCommand(name: string, signature: string) {
  const escapedSignature = signature
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s*");
  expect(hardeningSql).toMatch(
    new RegExp(
      `REVOKE ALL ON FUNCTION public\\.${name}\\(\\s*${escapedSignature}\\s*\\)` +
        "\\s*FROM PUBLIC, anon, authenticated, service_role;",
    ),
  );
  expect(hardeningSql).toMatch(
    new RegExp(
      `GRANT EXECUTE ON FUNCTION public\\.${name}\\(\\s*${escapedSignature}\\s*\\)` +
        "\\s*TO service_role;",
    ),
  );
}

describe("tenant private supplier catalog migration contract", () => {
  test("keeps the four applied 20260813 migrations byte-for-byte immutable", () => {
    for (const [name, expectedHash] of Object.entries(expectedHistoricalHashes)) {
      const content = read(migrations[name as keyof typeof migrations]);
      expect(createHash("sha256").update(content).digest("hex")).toBe(expectedHash);
    }
  });

  test("is a transactional forward-only correction with explicit timeouts", () => {
    expect(hardeningSql).toMatch(/^-- Rollback: forward-only\./);
    expect(hardeningSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(hardeningSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(hardeningSql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(hardeningSql).not.toMatch(/\bIF NOT EXISTS\b/i);
    expect(hardeningSql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|TYPE)\b/i);
  });

  test("targets the real applied jsonb and versioned catalog schema", () => {
    expect(hardeningSql).toContain("catalog_unit_suggestions");
    expect(hardeningSql).toContain("column_name = 'version'");
    expect(hardeningSql).toContain("catalog_spec_definitions");
    expect(hardeningSql).toContain("column_name = 'enum_options'");
    expect(hardeningSql).toContain("udt_name = 'jsonb'");
    expect(hardeningSql).toContain("column_name = 'is_required'");
    expect(hardeningSql).toContain("column_name = 'is_filterable'");
    expect(hardeningSql).toContain("column_name = 'suggested_code'");
    expect(hardeningSql).toContain("column_name = 'reviewed_by_employee_id'");
    expect(hardeningSql).toContain("SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED");

    expect(hardeningSql).not.toMatch(
      /ALTER TABLE public\.catalog_unit_suggestions[\s\S]*ADD COLUMN version/,
    );
    expect(hardeningSql).not.toMatch(/\bunnest\s*\(/i);
    expect(hardeningSql).not.toMatch(/\brequired\s*=/);
    expect(hardeningSql).not.toMatch(/\bfilterable\s*=/);
  });

  test("retains the complete category, brand, spec, and suggestion structure contract", () => {
    expect(catalogSql).toMatch(
      /ALTER TABLE public\.catalog_categories[\s\S]*ADD COLUMN full_name text[\s\S]*ADD COLUMN is_leaf boolean[\s\S]*ADD COLUMN mapped_platform_category_id uuid/,
    );
    expect(catalogSql).toMatch(
      /ALTER TABLE public\.catalog_brands[\s\S]*ADD COLUMN mapped_platform_brand_id uuid/,
    );
    expect(hardeningSql).toContain("catalog_spec_definitions_category_code_key");
    expect(hardeningSql).toContain("catalog_spec_definitions_enum_options_check");
    expect(hardeningSql).toContain("catalog_spec_definitions_unit_dimension_check");
    expect(hardeningSql).toContain("catalog_spec_definitions_ownership_check");
    expect(hardeningSql).toContain("catalog_unit_suggestions_review_state_check");
    expect(hardeningSql).toContain("catalog_unit_suggestions_version_check");
  });

  test("verifies the applied guard and command bodies before relying on them", () => {
    for (const guard of [
      "validate_catalog_brand_mapping",
      "validate_catalog_spec_definition_ownership",
      "validate_catalog_unit_suggestion_state",
      "validate_supplier_product_catalog",
    ]) {
      expect(hardeningSql).toContain(`public.${guard}()`);
    }
    expect(hardeningSql).toContain("pg_get_functiondef");
    expect(hardeningSql).toContain("SUPPLIER_CATALOG_COMMAND_CONTRACT_MISMATCH");
    expect(hardeningSql).toContain("supplier_command_events");
    expect(hardeningSql).toContain("p_idempotency_key");
    expect(hardeningSql).toContain("p_expected_version");
    expect(hardeningSql).toContain("source_platform_spec_id");
    expect(hardeningSql).toContain("INSERT INTO public.catalog_units");
  });

  test("replaces both legacy and applied hierarchy guards with an eight-level limit", () => {
    expect(hardeningSql).toMatch(
      /ALTER TABLE public\.catalog_categories\s+DROP CONSTRAINT catalog_categories_level_check,[\s\S]*CHECK \(level BETWEEN 1 AND 8\)/,
    );

    const legacyLevelGuard = latestFunction("set_catalog_category_level");
    expect(legacyLevelGuard).not.toBe("");
    expect(legacyLevelGuard).toContain("NEW.level > 8");
    expect(legacyLevelGuard).toContain("目录分类层级不能超过 8 级");
    expect(legacyLevelGuard).not.toContain("NEW.level > 6");

    const hierarchyGuard = latestFunction("validate_catalog_category_hierarchy");
    expect(hierarchyGuard).not.toBe("");
    expect(hierarchyGuard).toContain("NEW.level > 8");
    expect(hierarchyGuard).toContain("NEW.level + v_subtree_depth > 8");
    expect(hierarchyGuard).toContain("SUPPLIER_CATALOG_DEPTH_EXCEEDED");
  });

  test("rejects child attachment to product-bearing parents before leaf state changes", () => {
    const guard = latestFunction("validate_catalog_category_hierarchy");
    const parentReferenceCheck = guard.indexOf(
      "FROM public.supplier_products AS product WHERE product.category_id = parent.id",
    );
    const leafDerivation = guard.indexOf("NEW.is_leaf := NOT EXISTS");

    expect(guard).toContain("TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id");
    expect(parentReferenceCheck).toBeGreaterThan(-1);
    expect(guard).toContain("SUPPLIER_CATALOG_REFERENCE_IN_USE");
    expect(leafDerivation).toBeGreaterThan(parentReferenceCheck);
  });

  test("fails closed on direct writes to derived category fields", () => {
    const guard = latestFunction("validate_catalog_category_hierarchy");
    expect(guard).toContain("pg_trigger_depth() = 1");
    expect(guard).toContain("NEW.level IS DISTINCT FROM OLD.level");
    expect(guard).toContain("NEW.full_name IS DISTINCT FROM OLD.full_name");
    expect(guard).toContain("NEW.is_leaf IS DISTINCT FROM OLD.is_leaf");
    expect(guard).toContain("SUPPLIER_CATALOG_DERIVED_FIELD_IMMUTABLE");
    expect(guard).toContain("NEW.level := parent.level + 1");
    expect(guard).toContain("NEW.full_name := parent.full_name || ' / ' || btrim(NEW.name)");
    expect(guard).toContain("NEW.is_leaf := NOT EXISTS");
  });

  test("normalizes exactly one active platform no-brand or fails on a missing actor", () => {
    expect(hardeningSql).toContain("SUPPLIER_CATALOG_NO_BRAND_ACTOR_MISSING");
    expect(hardeningSql).toContain("employee.tenant_id IS NULL");
    expect(hardeningSql).toContain("employee.status = 'active'");
    expect(hardeningSql).toContain("'NO_BRAND'");
    expect(hardeningSql).toContain("'无品牌'");
    expect(hardeningSql).toContain("'active'");
    expect(hardeningSql).toMatch(
      /UPDATE public\.supplier_products AS product[\s\S]*SET brand_id = v_canonical_id/,
    );
    expect(hardeningSql).toMatch(
      /UPDATE public\.catalog_brands AS tenant_brand[\s\S]*SET mapped_platform_brand_id = v_canonical_id/,
    );
    expect(hardeningSql).toContain("NO_BRAND_LEGACY_");
    expect(hardeningSql).toContain("v_canonical_count IS DISTINCT FROM 1");
    expect(hardeningSql).toContain("SUPPLIER_CATALOG_NO_BRAND_INVARIANT_FAILED");
    expect(hardeningSql).toContain("catalog_brands_active_platform_no_brand_idx");
    expect(hardeningSql).toContain("catalog_brands_platform_no_brand_identity_idx");
  });

  test("keeps actual catalog commands fail-closed and service-role only", () => {
    expectServiceRoleCommand(
      "create_tenant_catalog_category",
      "uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text",
    );
    expectServiceRoleCommand(
      "update_tenant_catalog_category",
      "uuid, uuid, text, text, text, integer, uuid, integer, uuid, uuid, uuid, text",
    );
    expectServiceRoleCommand(
      "create_tenant_catalog_brand",
      "uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text",
    );
    expectServiceRoleCommand(
      "update_tenant_catalog_brand",
      "uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text",
    );
    expectServiceRoleCommand(
      "create_catalog_spec_definition",
      "uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, uuid, uuid, uuid, text",
    );
    expectServiceRoleCommand(
      "update_catalog_spec_definition",
      "uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, integer, uuid, uuid, uuid, text",
    );
    expectServiceRoleCommand(
      "copy_platform_category_specs",
      "uuid, uuid, integer, uuid, uuid, uuid, text",
    );
    expectServiceRoleCommand(
      "submit_tenant_catalog_unit_suggestion",
      "uuid, text, text, text, text, text, uuid, uuid, uuid, text",
    );
    expectServiceRoleCommand(
      "review_catalog_unit_suggestion",
      "uuid, text, uuid, text, integer, uuid, uuid, text",
    );
  });

  test("retains scoped indexes, forced RLS, and product leaf enforcement", () => {
    for (const indexName of [
      "catalog_categories_platform_code_unique_idx",
      "catalog_categories_tenant_code_unique_idx",
      "catalog_categories_mapping_lookup_idx",
      "catalog_brands_platform_code_unique_idx",
      "catalog_brands_tenant_code_unique_idx",
      "catalog_brands_mapping_lookup_idx",
      "catalog_spec_definitions_category_status_sort_idx",
      "catalog_spec_definitions_ownership_lookup_idx",
      "catalog_spec_definitions_source_copy_idx",
      "catalog_unit_suggestions_tenant_status_idx",
    ]) {
      expect([catalogSql, catalogCodesSql, hardeningSql].join("\n")).toContain(
        indexName,
      );
    }

    for (const table of [
      "catalog_categories",
      "catalog_brands",
      "catalog_spec_definitions",
      "catalog_unit_suggestions",
    ]) {
      expect(effectiveSchemaSql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(effectiveSchemaSql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }

    expect(hardeningSql).toContain("tr_supplier_products_validate_catalog");
    expect(hardeningSql).toContain("category.is_leaf");
    expect(productScopeSql).toContain(
      "ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;",
    );
    expect(platformProductSql).toContain("create_platform_supplier_product");
  });

  test("keeps hierarchy and identity helpers non-callable", () => {
    for (const helper of [
      "set_catalog_category_level",
      "validate_catalog_category_hierarchy",
      "protect_platform_no_brand_identity",
    ]) {
      expect(hardeningSql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${helper}\\(\\)` +
            "\\s*FROM PUBLIC, anon, authenticated, service_role;",
        ),
      );
      expect(hardeningSql).not.toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${helper}\\(`),
      );
    }
  });
});
