import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const migrationPaths = {
  catalog:
    "../../../../supabase/migrations/20260813170000_create_tenant_private_catalog.sql",
  productScope:
    "../../../../supabase/migrations/20260813180000_scope_supplier_products_and_prices.sql",
  catalogCodes:
    "../../../../supabase/migrations/20260813185000_scope_catalog_codes.sql",
  platformProduct:
    "../../../../supabase/migrations/20260813195000_allow_platform_product_write.sql",
  materialization:
    "../../../../supabase/migrations/20260818122000_materialize_tenant_supplier_catalog_schema.sql",
} as const;

function readMigration(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const materializationSql = readMigration(migrationPaths.materialization);
const expectedHistoricalHashes = new Map<string, string>([
  ["catalog", "203480335a963db3537012889fe9d317eec24290fbab53c0a1227df506d1c670"],
  ["productScope", "77fe7e3403c670b09a72a77929c518fffac1f3c7bbb373b12092011544a133d1"],
  ["catalogCodes", "d0a50ebb18395dfc071fcfc76cd889e18a005a20066488bb9fbf8d59526e82d8"],
  ["platformProduct", "6934417d363c8ba82a56d000e0742e1d3df359e05e59411e3cd2c79821332e0f"],
]);

describe("tenant supplier catalog schema materialization contract", () => {
  test("keeps the four applied 20260813 migrations byte-for-byte immutable", () => {
    for (const [key, expectedHash] of expectedHistoricalHashes) {
      const path = migrationPaths[key as keyof typeof migrationPaths];
      const actualHash = createHash("sha256")
        .update(readMigration(path))
        .digest("hex");
      expect(actualHash).toBe(expectedHash);
    }
  });

  test("is an explicit forward-only transaction with bounded locks", () => {
    expect(materializationSql).toMatch(/^-- Rollback: forward-only\./);
    expect(materializationSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(materializationSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(materializationSql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(materializationSql).not.toMatch(/\bIF NOT EXISTS\b/i);
    expect(materializationSql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|TYPE)\b/i);
  });

  test("recognizes only the repository-chain and granular-v2 states", () => {
    expect(materializationSql).toContain("repository_chain");
    expect(materializationSql).toContain("granular_v2");
    expect(materializationSql).toContain("SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED");
    for (const fingerprint of [
      "v_trigger_fingerprint",
      "v_function_fingerprint",
      "v_constraint_fingerprint",
      "v_index_fingerprint",
    ]) {
      expect(materializationSql).toContain(fingerprint);
    }
    for (const catalog of [
      "pg_trigger",
      "pg_proc",
      "pg_constraint",
      "pg_index",
    ]) {
      expect(materializationSql).toContain(catalog);
    }
  });

  test("converts legacy specs without inventing unit-suggestion facts", () => {
    expect(materializationSql).toMatch(
      /RENAME COLUMN required TO is_required[\s\S]*RENAME COLUMN filterable TO is_filterable/,
    );
    expect(materializationSql).toMatch(
      /ALTER COLUMN enum_options TYPE jsonb[\s\S]*to_jsonb\(enum_options\)/,
    );
    expect(materializationSql).toContain("lower(btrim(option.value))");
    expect(materializationSql).toContain("legacy_unclassified");
    expect(materializationSql).toContain(
      "SUPPLIER_CATALOG_UNIT_SUGGESTION_MAPPING_REQUIRED",
    );
  });

  test("preflights hierarchy, ownership, and active reference data", () => {
    const preflight = materializationSql.slice(
      0,
      materializationSql.indexOf("-- Remove only the trigger/constraint set"),
    );
    expect(preflight).toContain("public.supplier_products AS product");
    expect(preflight).toContain("public.catalog_spec_definitions AS definition");
    expect(preflight).toContain("public.catalog_categories AS child");
    expect(preflight).toContain("SUPPLIER_CATALOG_REFERENCE_IN_USE");
    expect(preflight).toContain("contains a cycle or exceeds eight levels");
    expect(preflight).toContain("exceeds eight levels");
  });

  test("materializes deterministic invoker guards and trigger ACLs", () => {
    for (const guard of [
      "validate_catalog_category_hierarchy",
      "refresh_catalog_category_descendants",
      "validate_catalog_brand_mapping",
      "validate_catalog_spec_definition_ownership",
      "validate_catalog_unit_suggestion_state",
      "validate_catalog_unit_dimension",
      "sync_catalog_base_unit_dimension_to_derived",
      "validate_supplier_product_catalog",
      "protect_platform_no_brand_identity",
    ]) {
      expect(materializationSql).toMatch(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${guard}\\(\\)[\\s\\S]*?` +
            "SECURITY INVOKER[\\s\\S]*?SET search_path = pg_catalog, public",
        ),
      );
      expect(materializationSql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${guard}\\(\\)\\s*` +
            "FROM PUBLIC, anon, authenticated, service_role;",
        ),
      );
    }
    expect(materializationSql).toContain("NEW.level > 8");
    expect(materializationSql).toContain("NEW.level + v_subtree_depth > 8");
    expect(materializationSql).toContain("SUPPLIER_CATALOG_DERIVED_FIELD_IMMUTABLE");
    expect(materializationSql).toContain("SUPPLIER_CATALOG_NO_BRAND_IMMUTABLE");
  });

  test("uses validated v2 constraints and a deterministic trigger set", () => {
    for (const constraint of [
      "catalog_categories_v2_level_check",
      "catalog_categories_v2_mapping_scope_check",
      "catalog_brands_v2_mapping_scope_check",
      "catalog_spec_definitions_v2_enum_options_check",
      "catalog_spec_definitions_v2_ownership_check",
      "catalog_unit_suggestions_v2_review_state_check",
      "catalog_units_v2_dimension_check",
    ]) {
      expect(materializationSql).toContain(`ADD CONSTRAINT ${constraint}`);
      expect(materializationSql).toContain(`VALIDATE CONSTRAINT ${constraint}`);
    }
    for (const table of [
      "catalog_categories",
      "catalog_brands",
      "catalog_units",
      "catalog_spec_definitions",
      "catalog_unit_suggestions",
    ]) {
      expect(materializationSql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
    }
    expect(materializationSql).toContain(
      "CREATE TRIGGER tr_catalog_categories_v2_validate_hierarchy",
    );
    expect(materializationSql).toContain(
      "CREATE TRIGGER tr_supplier_products_v2_guard_tenant_write",
    );
  });

  test("normalizes one deterministic supplier product catalog trigger", () => {
    const triggerCleanup = materializationSql.slice(
      materializationSql.indexOf(
        "-- Remove only the trigger/constraint set belonging to the recognized state.",
      ),
      materializationSql.indexOf("-- Materialize the repository-chain columns."),
    );

    expect(triggerCleanup).toContain("FROM pg_trigger AS trigger_definition");
    expect(triggerCleanup).toContain(
      "trigger_definition.tgrelid = 'public.supplier_products'::regclass",
    );
    expect(triggerCleanup).toContain("tr_supplier_products_validate_catalog");
    expect(triggerCleanup).toContain("tr_supplier_products_v2_validate_catalog");
    expect(triggerCleanup).toContain(
      "'public.validate_supplier_product_catalog()'::regprocedure",
    );
    expect(triggerCleanup).toContain(
      "DROP TRIGGER %I ON public.supplier_products",
    );
    expect(triggerCleanup).not.toContain(
      "tr_supplier_products_validate_proxy_actor",
    );
    expect(triggerCleanup).not.toContain(
      "supplier_products_price_publication_lock",
    );
    expect(materializationSql).toMatch(
      /CREATE TRIGGER tr_supplier_products_v2_validate_catalog\s+BEFORE INSERT OR UPDATE OF\s+category_id, brand_id, status\s+ON public\.supplier_products\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.validate_supplier_product_catalog\(\);/,
    );
  });

  test("reuses indexes and grants only trigger reference columns", () => {
    expect(materializationSql).toContain("ALTER INDEX");
    expect(materializationSql).toContain(
      "supplier_products_active_category_ref_idx",
    );
    expect(materializationSql).toContain("supplier_products_active_brand_ref_idx");
    expect(materializationSql).toContain("SUPPLIER_CATALOG_INDEX_BUILD_TOO_LARGE");
    expect(materializationSql).toContain(
      "GRANT SELECT (id, tenant_id, status) ON public.employees",
    );
    expect(materializationSql).toContain(
      "GRANT SELECT (category_id, brand_id, status) ON public.supplier_products",
    );
    expect(materializationSql).not.toContain(
      "GRANT SELECT ON TABLE public.employees",
    );
    expect(materializationSql).not.toContain(
      "GRANT SELECT ON TABLE public.supplier_products",
    );
  });
});
