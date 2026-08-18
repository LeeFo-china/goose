import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260819111000_close_supplier_product_runtime_boundaries.sql",
  import.meta.url,
);
const sql = readFileSync(migrationUrl, "utf8");

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string): string {
  return sql.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
}

describe("supplier product runtime hardening migration", () => {
  test("is a bounded forward migration with an explicit rollback", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("disable product and SKU writes");
    expect(sql).toContain("restore the");
    expect(sql).toContain("previous wrapper definitions");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).not.toMatch(/\bIF NOT EXISTS\b/i);
  });

  test("revokes every legacy product and SKU writer from browser and service roles", () => {
    for (const name of [
      "create_platform_supplier_product",
      "create_platform_supplier_sku",
      "create_supplier_product",
      "create_supplier_sku",
      "mutate_supplier_product_pre_v2_unsafe",
      "mutate_supplier_sku_for_product_pre_v2_unsafe",
    ]) {
      expect(compact(sql)).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
    }
  });

  test("rejects blank text specifications", () => {
    const validator = compact(
      extractFunction("supplier_sku_spec_value_is_valid"),
    );

    expect(validator).toContain("WHEN 'text' THEN");
    expect(validator).toContain("btrim(p_value #>> '{}') <> ''");
    expect(validator).toContain("SPEC_TEMPLATE_VALIDATION_ERROR");
  });

  test("locks every unit deterministically and rejects rounded zero factors", () => {
    const validator = compact(
      extractFunction("validate_supplier_sku_unit_conversion_graph"),
    );

    expect(validator).toContain("UNION SELECT sku.purchase_unit_id");
    expect(validator).toContain("UNION SELECT sku.base_unit_id");
    expect(validator).toContain("ORDER BY unit.id FOR SHARE");
    expect(validator).toContain(
      "validate_supplier_sku_unit_conversion_graph_pre_precision_unsafe",
    );
    expect(validator).toContain("v_factor IS NULL OR v_factor <= 0");
    expect(validator).toContain("UNIT_CONVERSION_INVALID");
  });

  test("hides cross-tenant SKU existence before delegating to the old command", () => {
    const command = compact(
      extractFunction("replace_supplier_sku_unit_conversions"),
    );
    const visibilityAt = command.indexOf("supplier_sku.id = p_supplier_sku_id");
    const notFoundAt = command.indexOf("SUPPLIER_SKU_NOT_FOUND");
    const delegateAt = command.indexOf(
      "replace_supplier_sku_unit_conversions_pre_visibility_unsafe",
    );

    expect(command).toContain("employee.user_id = p_actor_user_id");
    expect(command).toContain("supplier_sku.ownership_scope = 'platform'");
    expect(command).toContain("supplier_sku.ownership_scope = 'tenant'");
    expect(command).toContain(
      "supplier_sku.owner_tenant_id IS NOT DISTINCT FROM p_acting_tenant_id",
    );
    expect(visibilityAt).toBeGreaterThanOrEqual(0);
    expect(notFoundAt).toBeGreaterThan(visibilityAt);
    expect(delegateAt).toBeGreaterThan(notFoundAt);
    expect(command).not.toContain("PRODUCT_OWNERSHIP_CONFLICT");
  });

  test("keeps inner helpers private and exposes only the safe replacement command", () => {
    for (const name of [
      "validate_supplier_sku_unit_conversion_graph_pre_precision_unsafe",
      "replace_supplier_sku_unit_conversions_pre_visibility_unsafe",
    ]) {
      expect(compact(sql)).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ));
    }
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.replace_supplier_sku_unit_conversions\([\s\S]*?TO service_role;/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.(?:validate_supplier_sku_unit_conversion_graph_pre_precision_unsafe|replace_supplier_sku_unit_conversions_pre_visibility_unsafe)/,
    );
  });
});
