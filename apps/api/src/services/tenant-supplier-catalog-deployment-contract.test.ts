import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const repositoryRoot = new URL("../../../../", import.meta.url);

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, repositoryRoot), "utf8");
}

const materializationSql = read(
  "supabase/migrations/20260818122000_materialize_tenant_supplier_catalog_schema.sql",
);
const hardeningSql = read(
  "supabase/migrations/20260818130000_harden_tenant_private_catalog_contracts.sql",
);
const productionMigrationWorkflow = read(
  ".github/workflows/migrate-production-database.yml",
);
const behaviorVerifier = read(
  "scripts/verify-tenant-supplier-catalog-migrations.sh",
);

describe("tenant supplier catalog deployment contract", () => {
  test("fingerprints the critical B indexes before materialization", () => {
    expect(materializationSql).toContain("pg_index");
    expect(materializationSql).toContain("v_index_fingerprint");
    expect(materializationSql).toContain(
      "catalog_brands_platform_no_brand_identity_idx",
    );
    expect(materializationSql).toContain("pg_get_indexdef");
  });

  test("reuses equivalent indexes and adds bounded active-reference indexes", () => {
    expect(materializationSql).toContain("ALTER INDEX");
    expect(materializationSql).toContain(
      "supplier_products_active_category_ref_idx",
    );
    expect(materializationSql).toContain(
      "supplier_products_active_brand_ref_idx",
    );
    expect(materializationSql).toContain("SUPPLIER_CATALOG_INDEX_BUILD_TOO_LARGE");
    expect(materializationSql).toContain(
      "Low-frequency catalog configuration writes",
    );
  });

  test("uses column-level reference grants for invoker triggers", () => {
    expect(materializationSql).not.toContain(
      "GRANT SELECT ON TABLE public.employees TO service_role",
    );
    expect(materializationSql).not.toContain(
      "GRANT SELECT ON TABLE public.supplier_products TO service_role",
    );
    expect(materializationSql).toMatch(
      /GRANT SELECT \(id, tenant_id, status\) ON public\.employees\s+TO service_role/,
    );
    expect(materializationSql).toMatch(
      /GRANT SELECT \(category_id, brand_id, status\) ON public\.supplier_products\s+TO service_role/,
    );
  });

  test("hardening depends only on the deterministic 122000 schema", () => {
    expect(hardeningSql).toContain("catalog_categories_v2_level_check");
    expect(hardeningSql).toContain(
      "catalog_spec_definitions_v2_enum_options_check",
    );
    expect(hardeningSql).not.toContain(
      "catalog_spec_definitions_category_code_key",
    );
    expect(hardeningSql).not.toContain("set_catalog_category_level");
    expect(hardeningSql).not.toMatch(
      /(?:create|update|copy|submit|review)_tenant_catalog|create_catalog_spec_definition|update_catalog_spec_definition|copy_platform_category_specs|review_catalog_unit_suggestion/i,
    );
    expect(hardeningSql).not.toMatch(
      /(?:GRANT|REVOKE).*ON FUNCTION public\.(?:create|update|copy|submit|review)_/i,
    );
  });

  test("runs production DDL as a fail-closed supabase_admin session", () => {
    expect(productionMigrationWorkflow).toContain(
      "psql -U supabase_admin -d postgres",
    );
    expect(productionMigrationWorkflow).toContain("runner_identity");
    expect(productionMigrationWorkflow).toContain(
      "supabase_admin|true|true",
    );
    expect(productionMigrationWorkflow).toContain("error=migration_runner_invalid");
  });

  test("ships a rollback-only A/B behavior verifier", () => {
    expect(behaviorVerifier).toContain("gooes_catalog_v2_b_baseline");
    expect(behaviorVerifier).toContain("ROLLBACK;");
    expect(behaviorVerifier).toContain("SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED");
    expect(behaviorVerifier).toContain("duplicate_index_groups");
    expect(behaviorVerifier).toContain("EXPLAIN (COSTS OFF)");
    expect(behaviorVerifier).toContain("missing_catalog_trigger");
    expect(behaviorVerifier).toContain("tampered_catalog_trigger");
    expect(behaviorVerifier).toContain("non_leaf_category");
    expect(behaviorVerifier).toContain("inactive_category");
    expect(behaviorVerifier).toContain("inactive_brand");
    expect(behaviorVerifier).toContain("SUPPLIER_CATALOG_REFERENCE_INVALID");
    expect(behaviorVerifier).not.toMatch(/\b(?:db reset|supabase link)\b/);
  });
});
