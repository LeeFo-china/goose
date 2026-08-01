import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL(
  "../../../../supabase/migrations/20260801104000_create_branding_virtual_refund_reconciliation.sql",
  import.meta.url,
), "utf8");

describe("virtual refund reconciliation migration", () => {
  test("claims a bounded due batch with skip-locked leases", () => {
    expect(sql).toContain("p_limit NOT BETWEEN 1 AND 100");
    expect(sql).toContain("LIMIT p_limit FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("status IN ('submitted', 'external_required')");
    expect(sql).toContain("status = 'succeeded' AND refunds.compensation_status <> 'succeeded'");
  });

  test("only finalizes official terminal statuses with exact refund totals", () => {
    expect(sql).toContain("p_official_status NOT IN (5, 7, 8)");
    expect(sql).toContain("p_refund_fee_fen <> v_refund.amount_fen");
    expect(sql).toContain("p_left_fee_fen <> 0");
    expect(sql).toContain("p_left_fee_fen <> v_refund.amount_fen");
    expect(sql).toContain("v_refund.platform_mode = 'apple_external'");
    expect(sql.match(/SET search_path = pg_catalog, public/g)?.length).toBe(4);
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("branding_mark_virtual_refund_reconciliation_conflict");
    expect(sql).toContain("'infinity'::timestamptz");
  });

  test("fails closed on null inputs and locks order before refund", () => {
    expect(sql).not.toContain("auth.role() <> 'service_role'");
    expect(sql.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g)?.length)
      .toBe(4);
    for (const required of [
      "p_refund_id IS NULL", "p_claim_token IS NULL",
      "p_official_status IS NULL", "p_refund_fee_fen IS NULL",
      "p_left_fee_fen IS NULL", "p_error_code IS NULL",
      "p_error_summary IS NULL",
    ]) expect(sql).toContain(required);
    expect(sql).toContain(
      "v_refund.reconcile_claim_token IS DISTINCT FROM p_claim_token",
    );

    const finalize = functionBody(
      "branding_finalize_virtual_refund_reconciliation",
      "branding_reschedule_virtual_refund_reconciliation",
    );
    const advisory = finalize.indexOf("pg_advisory_xact_lock");
    const orderLock = finalize.indexOf("tenant_virtual_addon_orders");
    const refundLock = finalize.indexOf(
      "tenant_virtual_addon_refunds", orderLock + 1,
    );
    expect(advisory).toBeGreaterThan(0);
    expect(orderLock).toBeGreaterThan(advisory);
    expect(refundLock).toBeGreaterThan(orderLock);
  });
});

function functionBody(name: string, nextName: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  const end = sql.indexOf(`FUNCTION public.${nextName}`, start);
  return sql.slice(start, end);
}
