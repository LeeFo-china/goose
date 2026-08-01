import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  import.meta.dir,
  "../../../../supabase/migrations/20260731135000_create_branding_virtual_payment_refunds.sql",
);

describe("品牌权益虚拟支付退款 migration", () => {
  test("建立退款事实、独立补偿状态和有界 claim 索引", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    expect(migration).toContain("CREATE TABLE public.tenant_virtual_addon_refunds");
    expect(migration).toContain("compensation_status");
    expect(migration).toContain("reconcile_claim_token");
    expect(migration).toContain("WHERE status IN ('submitted', 'external_required', 'succeeded')");
  });

  test("反向权益事件以原购买事件为唯一幂等键", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    expect(migration).toContain("ADD COLUMN reverses_event_id uuid");
    expect(migration).toContain("tenant_entitlement_events_reverses_event_unique_idx");
    expect(migration).toContain("branding_compensate_virtual_addon_refund");
    expect(migration).toContain("'refunded', 'refund'");
  });

  test("使用官方 iOS 退款问询事件名并移除错误占位名", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    expect(migration).toContain("xpay_subscribe_ios_refund_query_notify");
    expect(migration).not.toContain("'xpay_refund_inquiry'");
  });

  test("只向 service_role 暴露定向 RPC 而不授予退款表写权限", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    expect(migration).toContain("REVOKE ALL ON TABLE public.tenant_virtual_addon_refunds");
    expect(migration).not.toContain(
      "GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_virtual_addon_refunds TO service_role",
    );
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.branding_create_virtual_addon_refund");
  });

  test("付款身份 context 同租户绑定且仅向 service_role 暴露最小字段", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const start = migration.indexOf(
      "FUNCTION public.branding_get_virtual_refund_order_context",
    );
    const end = migration.indexOf(
      "FUNCTION public.branding_list_virtual_addon_refunds",
      start,
    );
    const contextFunction = migration.slice(start, end);

    expect(contextFunction).toContain("employees.id = orders.created_by");
    expect(contextFunction).toContain(
      "employees.tenant_id = orders.tenant_id",
    );
    expect(contextFunction).toContain("'created_by_user_id', employees.user_id");
    expect(contextFunction).not.toContain("encrypted_session_key");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.branding_get_virtual_refund_order_context(uuid)\nTO service_role",
    );
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).not.toContain("SET search_path = public, pg_temp");
  });

  test("幂等作用域先锁订单再按租户键回放且提交副作用需要短租约", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const orderLock = migration.indexOf("WHERE orders.id = p_order_id\n  FOR UPDATE");
    const replayLookup = migration.indexOf(
      "refunds.tenant_id = v_order.tenant_id\n    AND refunds.idempotency_key = p_idempotency_key",
    );

    expect(orderLock).toBeGreaterThan(0);
    expect(replayLookup).toBeGreaterThan(orderLock);
    expect(migration).toContain(
      "branding_claim_virtual_addon_refund_submission",
    );
    expect(migration).toContain(
      "branding_renew_virtual_addon_refund_submission_claim",
    );
    expect(migration).toContain(
      "branding_release_virtual_addon_refund_submission_claim",
    );
  });
});
