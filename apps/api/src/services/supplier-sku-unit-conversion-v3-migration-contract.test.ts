import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260819122000_align_supplier_sku_unit_conversion_chain.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const legacyAclMigrationUrl = new URL(
  "../../../../supabase/migrations/20260819124000_close_legacy_supplier_sku_conversion_rpc.sql",
  import.meta.url,
);
const legacyAclSql = existsSync(legacyAclMigrationUrl)
  ? readFileSync(legacyAclMigrationUrl, "utf8")
  : "";

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string) {
  return sql.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
}

describe("supplier SKU unit conversion v3 migration", () => {
  test("is forward-only and replaces the unsafe service-role entry point", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.replace_supplier_sku_unit_conversions_v2",
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.replace_supplier_sku_unit_conversions_v2[\s\S]*?TO service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.replace_supplier_sku_unit_conversions_v3[\s\S]*?TO service_role;/,
    );
  });

  test("closes the pre-v2 conversion entry point for every API role", () => {
    expect(legacyAclSql).toMatch(/^-- Rollback: forward-only\./);
    expect(compact(legacyAclSql)).toContain(
      "REVOKE ALL ON FUNCTION public.replace_supplier_sku_unit_conversions( uuid, integer, jsonb, uuid, uuid, uuid, text ) FROM PUBLIC, anon, authenticated, service_role;",
    );
    expect(legacyAclSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.replace_supplier_sku_unit_conversions\(/,
    );
  });

  test("validates one product-specific linear chain across active units", () => {
    const validator = compact(
      extractFunction("validate_supplier_sku_unit_conversion_graph_v2"),
    );

    expect(validator).toContain("p_purchase_unit_id uuid");
    expect(validator).toContain("p_base_unit_id uuid");
    expect(validator).toContain("jsonb_array_length(p_edges) > 100");
    expect(validator).toContain("GROUP BY edge.from_unit_id HAVING count(*) > 1");
    expect(validator).toContain("GROUP BY edge.to_unit_id HAVING count(*) > 1");
    expect(validator).toContain("reachable_from_purchase");
    expect(validator).toContain("path.current_unit_id = p_base_unit_id");
    expect(validator).not.toContain(
      "from_unit.unit_dimension IS NOT DISTINCT FROM to_unit.unit_dimension",
    );
    expect(validator).not.toContain(
      "v_purchase_dimension IS NOT DISTINCT FROM v_base_dimension",
    );
  });

  test("updates purchase unit, inventory base unit and graph atomically", () => {
    const command = compact(
      extractFunction("replace_supplier_sku_unit_conversions_v3"),
    );

    expect(command).toContain("p_purchase_unit_id uuid");
    expect(command).toContain("p_base_unit_id uuid");
    expect(command).toContain("assert_supplier_product_v2_context");
    expect(command).toContain("supplier_product_id = p_supplier_product_id");
    expect(command).toContain("FOR UPDATE OF sku");
    expect(command).toContain("validate_supplier_sku_unit_conversion_graph_v2");
    expect(command).toContain("purchase_unit_id = p_purchase_unit_id");
    expect(command).toContain("base_unit_id = p_base_unit_id");
    expect(command).toContain("base_unit_conversion = v_factor");
    expect(command).toContain("supplier_sku_unit_conversions_v3");
    expect(command).toContain("SUPPLIER_IDEMPOTENCY_CONFLICT");
  });

  test("preserves only a conversion graph validated by the SKU unit trigger", () => {
    const trigger = compact(extractFunction("prepare_supplier_sku_unit"));

    expect(trigger).toContain("TG_OP = 'INSERT'");
    expect(trigger).toContain("OLD.purchase_unit_id");
    expect(trigger).toContain("OLD.base_unit_id");
    expect(trigger).toContain("OLD.base_unit_conversion");
    expect(trigger).toContain("validate_supplier_sku_unit_conversion_graph_v2");
    expect(trigger).toContain("supplier_sku_unit_conversions");
    expect(trigger).toContain("v_graph_factor IS DISTINCT FROM NEW.base_unit_conversion");
    expect(compact(sql)).toContain(
      "UPDATE OF supplier_id, supplier_product_id, purchase_unit_id, base_unit_id, base_unit_conversion, status",
    );
  });
});
