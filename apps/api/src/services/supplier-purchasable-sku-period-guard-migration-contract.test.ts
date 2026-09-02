import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260902110000_guard_supplier_purchasable_sku_noop_period_overlap.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

describe("supplier purchasable SKU period guard migration", () => {
  test("rejects a current/future overlap before metadata-only SKU mutation", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql.trimStart().startsWith("-- Rollback:")).toBe(true);
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/);
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    const command = sql.match(
      /CREATE(?: OR REPLACE)? FUNCTION public\.command_supplier_purchasable_sku_v1\([\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
    const normalized = command.replace(/\s+/g, " ").trim();
    const guardAt = normalized.indexOf(
      "v_current_price_list.effective_until > v_future_price_list.effective_from",
    );
    const skuMutationAt = normalized.indexOf("public.command_supplier_sku_v3(");

    expect(command).not.toBe("");
    expect(normalized).toMatch(
      /IF v_current_price_list\.id IS NOT NULL AND v_future_price_list\.id IS NOT NULL AND \( v_current_price_list\.effective_until IS NULL OR v_current_price_list\.effective_until > v_future_price_list\.effective_from \) THEN RETURN jsonb_build_object\( 'status', 'state_conflict', 'idempotent', false, 'error_code', 'SUPPLIER_PRICE_PERIOD_CONFLICT' \); END IF;/,
    );
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(guardAt).toBeLessThan(skuMutationAt);
  });
});
