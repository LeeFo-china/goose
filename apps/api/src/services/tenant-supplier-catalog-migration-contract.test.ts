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

const catalogSql = read(migrations.catalog);
const productScopeSql = read(migrations.productScope);
const catalogCodesSql = read(migrations.catalogCodes);
const platformProductSql = read(migrations.platformProduct);
const compatibilitySql = read(migrations.compatibility);
const hardeningSql = read(migrations.hardening);
const effectiveSql = [catalogSql, compatibilitySql, hardeningSql].join("\n");

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function latestFunction(name: string) {
  const matches = Array.from(
    effectiveSql.matchAll(
      new RegExp(
        `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
        "g",
      ),
    ),
  );
  return compact(matches.at(-1)?.[0] ?? "");
}

function expectTenantCommand(name: string, expectedVersion = false) {
  const command = latestFunction(name);
  expect(command).not.toBe("");
  expect(command).toContain("public.assert_tenant_supplier_actor(");
  expect(command).toContain("public.get_supplier_catalog_command_event(");
  expect(command).toContain("public.record_supplier_catalog_command(");
  if (expectedVersion) {
    expect(command).toContain("p_expected_version integer");
    expect(command).toMatch(/version IS DISTINCT FROM p_expected_version/);
  }
}

describe("tenant private supplier catalog migration contract", () => {
  test("keeps the four applied 20260813 migrations byte-for-byte immutable", () => {
    for (const [name, expectedHash] of Object.entries(expectedHistoricalHashes)) {
      const content = read(migrations[name as keyof typeof migrations]);
      expect(createHash("sha256").update(content).digest("hex")).toBe(expectedHash);
    }
  });

  test("repairs gaps only through a transactional forward migration", () => {
    expect(hardeningSql).toMatch(/^-- Rollback: forward-only\./);
    expect(hardeningSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(hardeningSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(hardeningSql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(hardeningSql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|TYPE)\b/i);
  });

  test("defines category paths, leaf state, platform mapping, brands, specs, and suggestions", () => {
    expect(catalogSql).toMatch(
      /ALTER TABLE public\.catalog_categories[\s\S]*ADD COLUMN full_name text[\s\S]*ADD COLUMN is_leaf boolean[\s\S]*ADD COLUMN mapped_platform_category_id uuid/,
    );
    expect(catalogSql).toMatch(
      /ALTER TABLE public\.catalog_brands[\s\S]*ADD COLUMN mapped_platform_brand_id uuid/,
    );

    const specs = compact(
      catalogSql.match(
        /CREATE TABLE public\.catalog_spec_definitions \([\s\S]*?\n\);/,
      )?.[0] ?? "",
    );
    expect(specs).toContain("category_id uuid NOT NULL");
    expect(specs).toContain("source_platform_spec_id uuid NULL");
    expect(specs).toContain("UNIQUE (category_id, code)");
    expect(specs).toContain("catalog_spec_definitions_enum_options_check");
    expect(specs).toContain("catalog_spec_definitions_ownership_check");

    const suggestions = compact(
      effectiveSql.match(
        /CREATE TABLE public\.catalog_unit_suggestions \([\s\S]*?\n\);/,
      )?.[0] ?? "",
    );
    expect(suggestions).toContain("tenant_id uuid NOT NULL");
    expect(suggestions).toContain("processed_by_employee_id uuid NULL");
    expect(hardeningSql).toMatch(
      /ALTER TABLE public\.catalog_unit_suggestions[\s\S]*ADD COLUMN version integer NOT NULL DEFAULT 1/,
    );
  });

  test("keeps category trees inside one owner and maps tenants only to active platform nodes", () => {
    const guard = latestFunction("guard_catalog_category_scope");
    expect(guard).toContain("v_parent.ownership_scope IS DISTINCT FROM NEW.ownership_scope");
    expect(guard).toContain("v_parent.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id");
    expect(guard).toContain("NEW.ownership_scope IS DISTINCT FROM 'tenant'");
    expect(guard).toContain("v_mapping.ownership_scope IS DISTINCT FROM 'platform'");
    expect(guard).toContain("v_mapping.status IS DISTINCT FROM 'active'");
    expect(guard).toContain("WITH RECURSIVE ancestors");
    expect(guard).toContain("NEW.id = ANY(ancestors.path_ids)");
    expect(guard).toContain("WITH RECURSIVE descendants");
    expect(guard).toContain("v_level + v_subtree_depth > 8");
    expect(guard).toContain("v_level > 8");
    expect(guard).toContain("NEW.full_name :=");

    const brandGuard = latestFunction("guard_catalog_brand_scope");
    expect(brandGuard).toContain("NEW.ownership_scope IS DISTINCT FROM 'tenant'");
    expect(brandGuard).toContain("v_mapping.ownership_scope IS DISTINCT FROM 'platform'");
    expect(brandGuard).toContain("v_mapping.status IS DISTINCT FROM 'active'");
    expect(catalogSql).toMatch(
      /'no_brand',\s*'无品牌',[\s\S]*?'platform',\s*NULL/,
    );
  });

  test("uses tenant-verified, idempotent, versioned, and audited category and brand commands", () => {
    expectTenantCommand("create_tenant_catalog_category");
    expectTenantCommand("update_tenant_catalog_category", true);
    expectTenantCommand("create_tenant_catalog_brand");
    expectTenantCommand("update_tenant_catalog_brand", true);

    const createCategory = latestFunction("create_tenant_catalog_category");
    expect(createCategory).toContain("v_full_name := v_parent.full_name || ' / ' || btrim(p_name)");
    expect(createCategory).toContain("v_level > 8");
    const updateCategory = latestFunction("update_tenant_catalog_category");
    expect(updateCategory).toContain("public.refresh_tenant_catalog_descendant_paths(");
  });

  test("allows products only on active leaf categories", () => {
    const productGuard = latestFunction("guard_supplier_product_ownership");
    expect(productGuard).toContain("v_category.status IS DISTINCT FROM 'active'");
    expect(productGuard).toContain("v_category.is_leaf IS DISTINCT FROM true");
  });

  test("validates spec ownership, enum options, number dimensions, and copy provenance", () => {
    expect(hardeningSql).toContain("catalog_spec_definitions_options_shape_check");
    const optionsValidator = latestFunction("catalog_enum_options_are_valid");
    expect(optionsValidator).toContain("cardinality(options) > 0");
    expect(optionsValidator).toContain("btrim(option_value) = ''");
    expect(optionsValidator).toContain("count(DISTINCT btrim(option_value))");
    expect(hardeningSql).toMatch(
      /value_type IN \('single_enum', 'multi_enum'\)[\s\S]*catalog_enum_options_are_valid\(enum_options\)/,
    );
    expect(hardeningSql).toMatch(
      /value_type = 'number'[\s\S]*unit_dimension = btrim\(unit_dimension\)/,
    );

    const guard = latestFunction("guard_catalog_spec_definition_scope");
    expect(guard).toContain("v_category.ownership_scope IS DISTINCT FROM NEW.ownership_scope");
    expect(guard).toContain("v_category.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id");
    expect(guard).toContain("v_source.ownership_scope IS DISTINCT FROM 'platform'");
    expect(guard).toContain("NEW.ownership_scope IS DISTINCT FROM 'tenant'");

    expectTenantCommand("create_tenant_catalog_spec_definition");
    expectTenantCommand("update_tenant_catalog_spec_definition", true);
    expectTenantCommand("copy_platform_category_specs", true);
    const copy = latestFunction("copy_platform_category_specs");
    expect(copy).toContain("'tenant', p_tenant_id, source.id");
    expect(copy).not.toContain("owner_tenant_id = source.owner_tenant_id");
  });

  test("keeps unit suggestions tenant-submitted and platform-processed without creating units", () => {
    expectTenantCommand("submit_catalog_unit_suggestion");
    const submit = latestFunction("submit_catalog_unit_suggestion");
    expect(submit).toContain("'pending'");

    const process = latestFunction("process_catalog_unit_suggestion");
    expect(process).toContain("public.assert_platform_operator_actor(");
    expect(process).toContain("public.get_supplier_catalog_command_event(");
    expect(process).toContain("public.record_supplier_catalog_command(");
    expect(process).toContain("p_expected_version integer");
    expect(process).toMatch(/version IS DISTINCT FROM p_expected_version/);
    expect(process).toMatch(/p_status NOT IN \('approved', 'rejected'\)/);
    expect(process).not.toMatch(/INSERT INTO public\.catalog_units\b/);

    const guard = latestFunction("guard_catalog_unit_suggestion_scope");
    expect(guard).toContain("NEW.tenant_id IS DISTINCT FROM OLD.tenant_id");
    expect(guard).toContain("NEW.version IS DISTINCT FROM OLD.version + 1");
    expect(guard).toContain("public.assert_platform_operator_actor(");
    expect(guard).toContain("NEW.status NOT IN ('approved', 'rejected')");
  });

  test("provides scoped indexes, forced RLS, and fail-closed ACLs", () => {
    for (const indexName of [
      "catalog_categories_platform_code_unique_idx",
      "catalog_categories_tenant_code_unique_idx",
      "catalog_brands_platform_code_unique_idx",
      "catalog_brands_tenant_code_unique_idx",
      "catalog_spec_definitions_category_status_sort_idx",
      "catalog_spec_definitions_ownership_tenant_idx",
      "catalog_unit_suggestions_tenant_status_idx",
    ]) {
      expect([catalogSql, catalogCodesSql].join("\n")).toContain(indexName);
    }
    for (const indexName of [
      "catalog_categories_tenant_mapping_idx",
      "catalog_brands_tenant_mapping_idx",
      "catalog_spec_definitions_source_platform_idx",
    ]) {
      expect(hardeningSql).toContain(indexName);
    }

    for (const table of [
      "catalog_categories",
      "catalog_brands",
      "catalog_spec_definitions",
      "catalog_unit_suggestions",
    ]) {
      expect(effectiveSql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(effectiveSql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
      expect(effectiveSql).toMatch(
        new RegExp(
          `REVOKE ALL ON TABLE public\\.${table}[\\s\\S]*?FROM PUBLIC, anon, authenticated`,
        ),
      );
    }

    for (const command of [
      "create_tenant_catalog_category",
      "update_tenant_catalog_category",
      "create_tenant_catalog_brand",
      "update_tenant_catalog_brand",
      "create_tenant_catalog_spec_definition",
      "update_tenant_catalog_spec_definition",
      "copy_platform_category_specs",
      "submit_catalog_unit_suggestion",
      "process_catalog_unit_suggestion",
    ]) {
      expect(hardeningSql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${command}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`,
        ),
      );
      expect(hardeningSql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${command}\\([\\s\\S]*?TO service_role;`,
        ),
      );
    }

    expect(productScopeSql).toContain(
      "ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;",
    );
    expect(platformProductSql).toContain("create_platform_supplier_product");

    for (const helper of [
      "get_supplier_catalog_command_event",
      "record_supplier_catalog_command",
      "guard_catalog_category_scope",
      "guard_catalog_brand_scope",
      "guard_catalog_spec_definition_scope",
      "guard_catalog_unit_suggestion_scope",
    ]) {
      expect(hardeningSql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${helper}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`,
        ),
      );
      expect(hardeningSql).not.toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${helper}\\(`,
        ),
      );
    }
  });
});
