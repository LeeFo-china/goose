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
  test("replaces caller-clock claim RPCs with bounded database-clock claims", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.billing_claim_expired_recharge_orders");
    expect(migration).toMatch(
      /DROP FUNCTION IF EXISTS public\.billing_claim_expired_recharge_orders\(\s*timestamptz,\s*integer,\s*integer,\s*uuid\[\]\s*\)/,
    );
    expect(migration).toContain("p_excluded_ids uuid[] DEFAULT ARRAY[]::uuid[]");
    expect(migration).toContain("BILLING_RECHARGE_CLAIM_EXCLUSIONS_TOO_LARGE");
    expect(migration).toContain("v_now timestamptz := clock_timestamp()");
    expect(migration).not.toContain("p_now timestamptz");
    expect(migration).toMatch(/cardinality\(p_excluded_ids\)[\s\S]*> 100/);
    expect(migration).toMatch(
      /orders\.id = ANY\(coalesce\(p_excluded_ids, ARRAY\[\]::uuid\[\]\)\)/,
    );
  });

  test("preserves bounded skip-locked lease semantics", () => {
    expect(migration).toContain("orders.channel = 'wechat_pay'");
    expect(migration).toContain("orders.status = 'pending'");
    expect(migration).toContain("orders.payment_expires_at <= v_now");
    expect(migration).toContain("orders.close_claim_expires_at <= v_now");
    expect(migration).toContain("ORDER BY orders.payment_expires_at ASC, orders.id ASC");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toMatch(/LIMIT least\(greatest\(coalesce\(p_limit, 100\), 1\), 100\)/i);
    expect(migration).toMatch(/least\(greatest\(coalesce\(p_lease_seconds, 60\), 10\), 600\)/i);
  });

  test("renews matching claims with the same database clock", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_renew_recharge_close_claim(",
    );
    expect(migration).toContain("p_order_id uuid");
    expect(migration).toContain("p_claim_token uuid");
    expect(migration).toContain("close_claim_expires_at = clock_timestamp() + make_interval(");
    expect(migration).toContain("orders.close_claim_token = p_claim_token");
    expect(migration).toContain("orders.status = 'pending'");
  });

  test("exposes only the final claim and renewal RPCs to service_role", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM anon/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.billing_renew_recharge_close_claim",
    );
  });
});
