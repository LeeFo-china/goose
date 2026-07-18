import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260718123000_extend_recharge_claim_exclusions.sql",
  ),
  "utf8",
);

describe("recharge expiration claim exclusion migration", () => {
  test("replaces the three-argument claim RPC with bounded exclusions", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.billing_claim_expired_recharge_orders");
    expect(migration).toContain("p_excluded_ids uuid[] DEFAULT ARRAY[]::uuid[]");
    expect(migration).toContain("BILLING_RECHARGE_CLAIM_NOW_REQUIRED");
    expect(migration).toContain("BILLING_RECHARGE_CLAIM_EXCLUSIONS_TOO_LARGE");
    expect(migration).toMatch(/cardinality\(p_excluded_ids\)[\s\S]*> 100/);
    expect(migration).toMatch(
      /orders\.id = ANY\(coalesce\(p_excluded_ids, ARRAY\[\]::uuid\[\]\)\)/,
    );
  });

  test("preserves bounded skip-locked lease semantics", () => {
    expect(migration).toContain("orders.channel = 'wechat_pay'");
    expect(migration).toContain("orders.status = 'pending'");
    expect(migration).toContain("orders.payment_expires_at <= p_now");
    expect(migration).toContain("orders.close_claim_expires_at <= p_now");
    expect(migration).toContain("ORDER BY orders.payment_expires_at ASC, orders.id ASC");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toMatch(/LIMIT least\(greatest\(coalesce\(p_limit, 100\), 1\), 100\)/i);
    expect(migration).toMatch(/least\(greatest\(coalesce\(p_lease_seconds, 60\), 10\), 600\)/i);
  });

  test("exposes only the four-argument claim RPC to service_role", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM anon/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
  });
});
