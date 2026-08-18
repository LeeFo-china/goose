import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const hardeningSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260818130000_harden_tenant_private_catalog_contracts.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("tenant supplier catalog hardening migration contract", () => {
  test("is a validation-only forward migration after 122000", () => {
    expect(hardeningSql).toMatch(/^-- Rollback: forward-only\./);
    expect(hardeningSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(hardeningSql).toContain("validation-only release gate");
    expect(hardeningSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(hardeningSql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(hardeningSql).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION/i);
    expect(hardeningSql).not.toMatch(/ALTER TABLE/i);
    expect(hardeningSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|public\.)/i);
  });

  test("requires only deterministic v2 constraints and indexes", () => {
    for (const objectName of [
      "catalog_categories_v2_level_check",
      "catalog_spec_definitions_v2_enum_options_check",
      "catalog_unit_suggestions_v2_review_state_check",
      "catalog_categories_v2_platform_code_uidx",
      "catalog_brands_platform_no_brand_identity_idx",
      "supplier_products_active_category_ref_idx",
      "supplier_products_active_brand_ref_idx",
    ]) {
      expect(hardeningSql).toContain(objectName);
    }
    expect(hardeningSql).not.toContain(
      "catalog_spec_definitions_category_code_key",
    );
    expect(hardeningSql).not.toContain(
      "catalog_spec_definitions_enum_options_check",
    );
    expect(hardeningSql).not.toContain("set_catalog_category_level");
  });

  test("validates the canonical no-brand and duplicate-index invariants", () => {
    expect(hardeningSql).toContain("v_no_brand_count <> 1");
    expect(hardeningSql).toContain("v_no_brand_identity_count <> 1");
    expect(hardeningSql).toContain("SUPPLIER_CATALOG_NO_BRAND_INVARIANT_FAILED");
    expect(hardeningSql).toContain("duplicate_index_groups");
    expect(hardeningSql).toContain("pg_get_indexdef");
  });

  test("validates the supplier product catalog trigger definition", () => {
    expect(hardeningSql).toContain("v_catalog_trigger_count <> 1");
    expect(hardeningSql).toContain(
      "tr_supplier_products_v2_validate_catalog",
    );
    expect(hardeningSql).toContain(
      "'public.validate_supplier_product_catalog()'::regprocedure",
    );
    expect(hardeningSql).toContain(
      "trigger_definition.tgrelid = 'public.supplier_products'::regclass",
    );
    expect(hardeningSql).toContain("trigger_definition.tgenabled = 'O'");
    expect(hardeningSql).toContain("pg_get_triggerdef(trigger_definition.oid)");
    expect(hardeningSql).toContain(
      "BEFORE INSERT OR UPDATE OF category_id, brand_id, status ON public.supplier_products",
    );
    expect(hardeningSql).toContain(
      "EXECUTE FUNCTION validate_supplier_product_catalog()",
    );
  });

  test("validates browser denial and column-level service reads", () => {
    expect(hardeningSql).toContain("ARRAY['anon', 'authenticated']");
    expect(hardeningSql).toContain("permission.grantee = 0");
    expect(hardeningSql).toContain(
      "has_table_privilege('service_role', 'public.employees', 'SELECT')",
    );
    for (const column of ["id", "tenant_id", "status", "category_id", "brand_id"]) {
      expect(hardeningSql).toContain(`'${column}', 'SELECT'`);
    }
  });

  test("does not inspect or grant future command functions", () => {
    for (const command of [
      "create_tenant_catalog_category",
      "update_tenant_catalog_category",
      "create_tenant_catalog_brand",
      "update_tenant_catalog_brand",
      "create_catalog_spec_definition",
      "update_catalog_spec_definition",
      "copy_platform_category_specs",
      "submit_tenant_catalog_unit_suggestion",
      "review_catalog_unit_suggestion",
    ]) {
      expect(hardeningSql).not.toContain(command);
    }
    expect(hardeningSql).not.toMatch(/(?:GRANT|REVOKE).*ON FUNCTION/i);
  });
});
