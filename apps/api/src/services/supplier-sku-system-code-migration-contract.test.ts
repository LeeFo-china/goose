import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260829160000_system_manage_supplier_sku_codes.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const composite = sql.match(
  /CREATE FUNCTION public\.command_supplier_purchasable_product_v2\([\s\S]*?\n\$\$;/,
)?.[0] ?? "";

describe("supplier SKU system code migration", () => {
  test("adds a service-role-only v3 wrapper with full UUID codes", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(
      /^-- Rollback: older API callers remain compatible; keep this forward-compatible database migration applied\./,
    );
    expect(sql).toMatch(/^-- Rollback:[^\n]+\nBEGIN;/);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);

    const normalized = compact(sql);
    expect(normalized).toContain("CREATE FUNCTION public.command_supplier_sku_v3(");
    expect(normalized).toContain("upper(replace(p_sku_id::text, '-', ''))");
    expect(normalized).not.toContain("left(replace(p_sku_id::text, '-', ''), 16)");
    expect(normalized).toContain("p_payload - 'sku_code'");
    expect(normalized).toContain("public.command_supplier_sku_v2(");
    expect(normalized).toContain("SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT'");
  });

  test("normalizes old request events and keeps v2 available during rollout", () => {
    const normalized = compact(sql);
    expect(normalized).toContain("v_previous_payload - 'sku_code'");
    expect(normalized).toContain("v_previous_request IS DISTINCT FROM v_current_request");
    expect(normalized).not.toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.command_supplier_sku_v2\([^)]+\) FROM service_role;/,
    );
    expect(normalized).toContain("Keep v2 executable during rollout and rollback");
    expect(normalized).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.command_supplier_sku_v3\([^)]+\) TO service_role;/,
    );
  });

  test("upgrades the composite purchasable-product entry point", () => {
    const normalized = compact(composite);

    expect(normalized).toContain(
      "v_effective_sku := (p_sku - 'sku_code') || jsonb_build_object( 'sku_code', 'TS-' || upper(replace(p_sku_id::text, '-', '')) )",
    );
    expect(normalized).not.toContain(
      "'TS-' || left(replace(p_sku_id::text, '-', ''), 16)",
    );
    expect(normalized.match(/public\.command_supplier_sku_v3\(/g))
      .toHaveLength(2);
    expect(normalized).not.toContain("public.command_supplier_sku_v2(");
    expect(normalized).toContain(
      "v_previous_parent_request := v_event.from_state -> '_request'",
    );
    expect(normalized).toContain(
      "v_previous_parent_request IS DISTINCT FROM v_parent_request",
    );
    expect(normalized).toContain(
      "v_event.command NOT IN ( 'supplier_purchasable_product_v1:create', 'supplier_purchasable_product_v2:create' )",
    );
    expect(compact(sql)).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.command_supplier_purchasable_product_v2\([^)]+\) TO service_role;/,
    );
  });
});
