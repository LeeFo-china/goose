import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260718124000_harden_tenant_credit_refund_reconciliation.sql",
  import.meta.url,
);

const RPC_NAMES = [
  "billing_begin_wechat_recharge_refund",
  "billing_claim_wechat_recharge_refunds",
  "billing_reschedule_wechat_recharge_refund",
  "billing_close_wechat_recharge_refund",
  "billing_apply_wechat_recharge_refund_callback_state",
  "billing_confirm_wechat_recharge_refund",
] as const;

const RPC_SIGNATURES = {
  billing_begin_wechat_recharge_refund: "uuid, text, timestamptz",
  billing_claim_wechat_recharge_refunds:
    "integer, integer, uuid, timestamptz",
  billing_reschedule_wechat_recharge_refund:
    "uuid, uuid, timestamptz, timestamptz, text, jsonb, text, integer",
  billing_close_wechat_recharge_refund:
    "uuid, uuid, timestamptz, jsonb",
  billing_apply_wechat_recharge_refund_callback_state:
    "uuid, text, text, timestamptz, jsonb",
  billing_confirm_wechat_recharge_refund:
    "uuid, text, text, integer, timestamptz, uuid, jsonb",
} as const;

function sql() {
  return existsSync(migration) ? readFileSync(migration, "utf8") : "";
}

function functionSql(
  source: string,
  name: (typeof RPC_NAMES)[number],
) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) return "";
  const end = source.indexOf("$$;", start);
  return end < 0 ? source.slice(start) : source.slice(start, end + 3);
}

describe("tenant credit refund reconciliation migration", () => {
  test("adds bounded reconciliation lease state", () => {
    const source = sql();

    expect(source).toContain("reconcile_next_at timestamptz");
    expect(source).toContain(
      "reconcile_attempt_count integer NOT NULL DEFAULT 0",
    );
    expect(source).toContain("reconcile_claim_token uuid");
    expect(source).toContain("reconcile_claim_expires_at timestamptz");
    expect(source).toContain("reconcile_last_error text");
    expect(source).toContain("reconcile_last_checked_at timestamptz");
    expect(source).toMatch(/CHECK \(reconcile_attempt_count >= 0\)/);
    expect(source).toMatch(
      /CHECK \([\s\S]*reconcile_claim_token IS NULL[\s\S]*reconcile_claim_expires_at IS NULL[\s\S]*reconcile_claim_token IS NOT NULL[\s\S]*reconcile_claim_expires_at IS NOT NULL[\s\S]*\)/,
    );
    expect(source).toMatch(
      /CREATE INDEX IF NOT EXISTS tenant_credit_refund_reconcile_due_idx[\s\S]*ON public\.tenant_credit_refund_requests\(reconcile_next_at, id\)[\s\S]*WHERE status = 'refunding' AND reconcile_next_at IS NOT NULL;/,
    );
  });

  test("claims a bounded due batch with expiring token leases", () => {
    const source = functionSql(
      sql(),
      "billing_claim_wechat_recharge_refunds",
    );

    expect(source).toContain("RETURNS SETOF public.tenant_credit_refund_requests");
    expect(source).toContain("p_limit NOT BETWEEN 1 AND 100");
    expect(source).toContain(
      "BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID",
    );
    expect(source).toContain("FOR UPDATE SKIP LOCKED");
    expect(source).toContain(
      "reconcile_attempt_count = request.reconcile_attempt_count + 1",
    );
    expect(source).toMatch(
      /request\.status = 'refunding'[\s\S]*request\.reconcile_next_at <= p_now[\s\S]*request\.reconcile_claim_token IS NULL[\s\S]*request\.reconcile_claim_expires_at <= p_now/,
    );
    expect(source).toMatch(
      /ORDER BY request\.reconcile_next_at, request\.id[\s\S]*LIMIT p_limit[\s\S]*FOR UPDATE SKIP LOCKED/,
    );
    expect(source).toContain("reconcile_claim_token = p_claim_token");
    expect(source).toContain(
      "reconcile_claim_expires_at = p_now + make_interval(secs => p_lease_seconds)",
    );
  });

  test("begins refund execution by locking request then order atomically", () => {
    const source = functionSql(sql(), "billing_begin_wechat_recharge_refund");
    const requestLock = source.indexOf(
      "FROM public.tenant_credit_refund_requests",
    );
    const orderLock = source.indexOf("FROM public.tenant_credit_orders");

    expect(requestLock).toBeGreaterThan(0);
    expect(orderLock).toBeGreaterThan(requestLock);
    expect(source.match(/FOR UPDATE/g)).toHaveLength(2);
    expect(source).toContain("v_request.status NOT IN ('approved', 'failed')");
    expect(source).toContain("RETURN NULL");
    expect(source).toContain(
      "v_request.out_refund_no <> p_out_refund_no",
    );
    expect(source).toMatch(
      /UPDATE public\.tenant_credit_refund_requests[\s\S]*status = 'refunding'[\s\S]*out_refund_no = coalesce\(out_refund_no, p_out_refund_no\)[\s\S]*reconcile_next_at = p_now \+ interval '1 minute'[\s\S]*UPDATE public\.tenant_credit_orders[\s\S]*refund_status = 'refunding'/,
    );
  });

  test("reschedules and closes only the exact active claim", () => {
    const reschedule = functionSql(
      sql(),
      "billing_reschedule_wechat_recharge_refund",
    );
    const close = functionSql(sql(), "billing_close_wechat_recharge_refund");

    for (const source of [reschedule, close]) {
      expect(source).toContain("request.status = 'refunding'");
      expect(source).toContain(
        "request.reconcile_claim_token = p_claim_token",
      );
      expect(source).toContain("reconcile_claim_token = NULL");
      expect(source).toContain("reconcile_claim_expires_at = NULL");
      expect(source).toContain("RETURNS boolean");
    }
    expect(reschedule).toContain(
      "wechat_refund_id = coalesce(p_wechat_refund_id, wechat_refund_id)",
    );
    expect(reschedule).toContain(
      "refund_amount_fen = coalesce(p_refund_amount_fen, refund_amount_fen)",
    );
    expect(reschedule).toContain("reconcile_next_at = p_reconcile_next_at");
    expect(reschedule).toContain("reconcile_last_checked_at = p_checked_at");
    expect(reschedule).toContain("reconcile_last_error = p_last_error");
    expect(close).toContain("failure_message = 'WECHAT_REFUND_CLOSED'");
    expect(close).toContain("reconcile_next_at = NULL");
    expect(close).toMatch(
      /UPDATE public\.tenant_credit_orders[\s\S]*refund_status = 'failed'/,
    );
  });

  test("applies only validated CLOSED or ABNORMAL callback states", () => {
    const source = functionSql(
      sql(),
      "billing_apply_wechat_recharge_refund_callback_state",
    );
    const requestLock = source.indexOf(
      "FROM public.tenant_credit_refund_requests",
    );
    const orderLock = source.indexOf("FROM public.tenant_credit_orders");

    expect(source).toContain("p_status NOT IN ('CLOSED', 'ABNORMAL')");
    expect(source).toContain(
      "BILLING_RECHARGE_REFUND_CALLBACK_STATUS_INVALID",
    );
    expect(requestLock).toBeGreaterThan(0);
    expect(orderLock).toBeGreaterThan(requestLock);
    expect(source.match(/FOR UPDATE/g)).toHaveLength(2);
    expect(source).toContain("v_request.out_refund_no <> p_out_refund_no");
    expect(source).toContain("v_request.status <> 'refunding'");
    expect(source).toContain("RETURN false");
    expect(source).toContain("failure_message = 'WECHAT_REFUND_CLOSED'");
    expect(source).toContain("reconcile_last_error = 'WECHAT_REFUND_ABNORMAL'");
    expect(source).toContain(
      "reconcile_next_at = p_checked_at + interval '30 minutes'",
    );
    expect(source).toContain("refund_status = 'refunding'");
  });

  test("preserves atomic confirmation and clears reconciliation state", () => {
    const source = functionSql(
      sql(),
      "billing_confirm_wechat_recharge_refund",
    );

    expect(source).toMatch(
      /FROM public\.tenant_credit_refund_requests[\s\S]*FOR UPDATE[\s\S]*FROM public\.tenant_credit_orders[\s\S]*FOR UPDATE/,
    );
    expect(source).toContain("v_request.status = 'refunded'");
    expect(source).toContain(
      "source_type = 'tenant_credit_refund_request'",
    );
    expect(source).toContain("event_type = 'wechat_recharge_refund'");
    expect(source).toContain("INSERT INTO public.tenant_credit_ledger");
    expect(source).toContain(
      "latest_notification_id = coalesce(p_notification_id, latest_notification_id)",
    );
    expect(source).toMatch(
      /status = 'refunded'[\s\S]*reconcile_next_at = NULL[\s\S]*reconcile_claim_token = NULL[\s\S]*reconcile_claim_expires_at = NULL[\s\S]*reconcile_last_error = NULL[\s\S]*reconcile_last_checked_at = v_refunded_at/,
    );
  });

  test("runs atomically and exposes every RPC only to service role", () => {
    const source = sql();

    expect(source.trimStart().startsWith("--")).toBe(true);
    expect(source).toMatch(/\bBEGIN;/);
    expect(source.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(source).toMatch(/Rollback:/i);

    for (const name of RPC_NAMES) {
      const rpc = functionSql(source, name);
      const signature = RPC_SIGNATURES[name];

      expect(rpc).toContain("SECURITY DEFINER");
      expect(rpc).toContain("SET search_path = pg_catalog, public");
      expect(source).toContain(
        `REVOKE ALL ON FUNCTION public.${name}(${signature}) FROM PUBLIC, anon, authenticated;`,
      );
      expect(source).toContain(
        `GRANT EXECUTE ON FUNCTION public.${name}(${signature}) TO service_role;`,
      );
    }
  });
});
