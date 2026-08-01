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
    expect(sql.match(/SET search_path = pg_catalog, public/g)?.length).toBe(3);
    expect(sql).toContain("TO service_role");
  });
});
