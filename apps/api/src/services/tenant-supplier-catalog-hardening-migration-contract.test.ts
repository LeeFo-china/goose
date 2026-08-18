import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const hardeningSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260818130000_harden_tenant_private_catalog_contracts.sql",
    import.meta.url,
  ),
  "utf8",
);
const normalizedHardeningSql = hardeningSql.replace(/\s+/g, " ");

const expectedConstraints = [
  ["catalog_categories", "catalog_categories_v2_level_check"],
  ["catalog_categories", "catalog_categories_v2_full_name_check"],
  ["catalog_categories", "catalog_categories_v2_full_name_not_null"],
  ["catalog_categories", "catalog_categories_v2_mapping_scope_check"],
  ["catalog_brands", "catalog_brands_v2_mapping_scope_check"],
  ["catalog_spec_definitions", "catalog_spec_definitions_v2_enum_options_check"],
  ["catalog_spec_definitions", "catalog_spec_definitions_v2_unit_dimension_check"],
  ["catalog_spec_definitions", "catalog_spec_definitions_v2_ownership_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_code_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_name_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_symbol_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_dimension_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_reason_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_status_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_version_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_review_remark_check"],
  ["catalog_unit_suggestions", "catalog_unit_suggestions_v2_review_state_check"],
  ["catalog_units", "catalog_units_v2_dimension_check"],
  ["catalog_units", "catalog_units_v2_dimension_not_null"],
] as const;

const expectedTriggers = [
  ["catalog_categories", "tr_catalog_categories_v2_lock_hierarchy", "lock_catalog_category_hierarchy", 22, []],
  ["catalog_categories", "tr_catalog_categories_v2_guard_ownership_immutable", "guard_supplier_ownership_immutable", 19, ["ownership_scope", "owner_tenant_id"]],
  ["catalog_categories", "tr_catalog_categories_v2_validate_hierarchy", "validate_catalog_category_hierarchy", 23, []],
  ["catalog_categories", "tr_catalog_categories_v2_refresh_descendants", "refresh_catalog_category_descendants", 21, ["parent_id", "name"]],
  ["catalog_categories", "tr_catalog_categories_v2_refresh_after_delete", "refresh_catalog_category_descendants", 9, []],
  ["catalog_categories", "tr_catalog_categories_v2_protect_references", "protect_active_supplier_catalog_reference", 19, ["status"]],
  ["catalog_categories", "tr_catalog_categories_v2_updated_at", "update_updated_at_column", 19, []],
  ["catalog_brands", "tr_catalog_brands_v2_guard_ownership_immutable", "guard_supplier_ownership_immutable", 19, ["ownership_scope", "owner_tenant_id"]],
  ["catalog_brands", "tr_catalog_brands_v2_validate_mapping", "validate_catalog_brand_mapping", 23, ["mapped_platform_brand_id", "ownership_scope", "owner_tenant_id", "status"]],
  ["catalog_brands", "tr_catalog_brands_v2_protect_references", "protect_active_supplier_catalog_reference", 19, ["status"]],
  ["catalog_brands", "tr_catalog_brands_v2_protect_platform_no_brand", "protect_platform_no_brand_identity", 27, []],
  ["catalog_brands", "tr_catalog_brands_v2_updated_at", "update_updated_at_column", 19, []],
  ["catalog_spec_definitions", "tr_catalog_spec_definitions_v2_validate_ownership", "validate_catalog_spec_definition_ownership", 23, []],
  ["catalog_spec_definitions", "tr_catalog_spec_definitions_v2_guard_ownership_immutable", "guard_supplier_ownership_immutable", 19, ["ownership_scope", "owner_tenant_id"]],
  ["catalog_spec_definitions", "tr_catalog_spec_definitions_v2_updated_at", "update_updated_at_column", 19, []],
  ["catalog_unit_suggestions", "tr_catalog_unit_suggestions_v2_validate_state", "validate_catalog_unit_suggestion_state", 23, []],
  ["catalog_unit_suggestions", "tr_catalog_unit_suggestions_v2_updated_at", "update_updated_at_column", 19, []],
  ["catalog_units", "tr_catalog_units_v2_validate_dimension", "validate_catalog_unit_dimension", 23, ["base_unit_id", "unit_dimension"]],
  ["catalog_units", "tr_catalog_units_v2_validate_base", "validate_catalog_unit_base", 23, []],
  ["catalog_units", "tr_catalog_units_v2_lock_hierarchy", "lock_catalog_unit_hierarchy", 22, []],
  ["catalog_units", "tr_catalog_units_v2_sync_base_dimension", "sync_catalog_base_unit_dimension_to_derived", 17, ["unit_dimension"]],
  ["catalog_units", "tr_catalog_units_v2_updated_at", "update_updated_at_column", 19, []],
  ["supplier_products", "tr_supplier_products_v2_guard_ownership", "guard_supplier_product_ownership", 23, ["supplier_id", "category_id", "brand_id", "ownership_scope", "owner_tenant_id"]],
  ["supplier_products", "tr_supplier_products_v2_validate_catalog", "validate_supplier_product_catalog", 23, ["category_id", "brand_id", "status"]],
  ["supplier_products", "tr_supplier_products_v2_guard_tenant_write", "guard_supplier_product_tenant_write", 19, []],
] as const;

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

  test("binds every deterministic v2 constraint to its expected table", () => {
    expect(hardeningSql).toContain(
      "expected_constraints(table_name, constraint_name)",
    );
    expect(hardeningSql).toContain(
      "constraint_definition.conrelid = to_regclass(",
    );
    for (const [tableName, constraintName] of expectedConstraints) {
      expect(normalizedHardeningSql).toContain(
        `('${tableName}', '${constraintName}')`,
      );
    }
  });

  test("requires only deterministic v2 indexes", () => {
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

  test("validates every critical trigger from structural metadata", () => {
    expect(normalizedHardeningSql).toContain(
      "expected_triggers( table_name, trigger_name, function_name, trigger_type, update_columns )",
    );
    expect(hardeningSql).toContain(
      "trigger_definition.tgrelid = to_regclass(",
    );
    expect(hardeningSql).toContain(
      "procedure_definition.oid = trigger_definition.tgfoid",
    );
    expect(hardeningSql).toContain("trigger_definition.tgenabled = 'O'");
    expect(hardeningSql).toContain("trigger_definition.tgtype = expected_trigger.trigger_type");
    expect(hardeningSql).toContain("trigger_definition.tgattr::smallint[]");
    expect(hardeningSql).toContain("JOIN pg_attribute AS attribute_definition");
    expect(hardeningSql).toContain("procedure_definition.proname");
    expect(hardeningSql).not.toMatch(
      /pg_get_triggerdef\([^)]*\)\s*=/,
    );

    for (const [tableName, triggerName, functionName, triggerType, columns] of expectedTriggers) {
      const updateColumns = columns.length === 0
        ? "ARRAY[]::text[]"
        : `ARRAY[${columns.map((column) => `'${column}'`).join(", ")}]::text[]`;
      expect(normalizedHardeningSql).toContain(
        `('${tableName}', '${triggerName}', '${functionName}', ${triggerType}, ${updateColumns})`,
      );
    }
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
