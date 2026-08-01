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

  test("成功退款只生成一个反向权益事件并精确恢复购买快照", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");

    expect(migration).toContain("ADD COLUMN reverses_event_id uuid");
    expect(migration).toContain("tenant_entitlement_events_reverses_event_unique_idx");
    expect(migration).toContain("branding_compensate_virtual_addon_refund");
    expect(migration).toContain("'refunded', 'refund'");
    expect(migration).toContain("v_purchase_event.old_value->>'expires_at'");
    expect(migration).toContain("v_purchase_event.new_value->>'starts_at'");
    expect(migration).toContain(
      "WHERE events.reverses_event_id = v_purchase_event.id",
    );
    expect(migration).toContain(
      "compensation_entitlement_event_id = v_reversal.id",
    );
    expect(migration).toContain(
      "v_entitlement.expires_at\n        <> (v_purchase_event.new_value->>'expires_at')::timestamptz",
    );
    expect(migration).not.toContain(
      "v_entitlement.expires_at - interval '1 year'",
    );
  });

  test("退款模式只使用微信确认的支付 order_type", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const createStart = migration.indexOf(
      "FUNCTION public.branding_create_virtual_addon_refund",
    );
    const createEnd = migration.indexOf(
      "FUNCTION public.branding_claim_virtual_addon_refund_submission",
      createStart,
    );
    const createFunction = migration.slice(createStart, createEnd);
    expect(migration).toContain("ADD COLUMN provider_order_type integer");
    expect(migration).toContain("branding_record_virtual_order_type_fact");
    expect(createFunction).toContain("v_order.provider_order_type = 7");
    expect(createFunction).not.toContain("v_order.requested_platform");
    expect(migration).toContain("provider_channel");
    expect(migration).not.toContain("provider_platform");
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

  test("所有服务入口鉴权空值安全且跨表写遵循统一锁序", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    expect(migration).not.toContain("auth.role() <> 'service_role'");
    expect(migration.match(/SECURITY DEFINER/g)?.length).toBe(10);
    expect(migration.match(/auth\.role\(\)/g)?.length).toBe(10);
    expect(migration).toContain("v_order.provider_order_type IS NULL");
    expect(migration).toContain(
      "v_refund.reconcile_claim_expires_at IS NULL",
    );

    for (const [name, nextName] of [
      ["branding_record_virtual_order_type_fact",
        "branding_create_virtual_addon_refund"],
      ["branding_create_virtual_addon_refund",
        "branding_claim_virtual_addon_refund_submission"],
      ["branding_mark_virtual_addon_refund_submitted",
        "branding_compensate_virtual_addon_refund"],
      ["branding_compensate_virtual_addon_refund",
        "branding_get_virtual_refund_order_context"],
    ] as const) {
      const body = functionBody(migration, name, nextName);
      const advisory = body.indexOf("pg_advisory_xact_lock");
      const orderLock = body.indexOf("tenant_virtual_addon_orders", advisory);
      const refundLock = body.indexOf("tenant_virtual_addon_refunds", orderLock);
      expect(advisory).toBeGreaterThan(0);
      expect(orderLock).toBeGreaterThan(advisory);
      if (name !== "branding_record_virtual_order_type_fact") {
        expect(refundLock).toBeGreaterThan(orderLock);
      }
    }
  });

  test("Admin 列表和详情显式白名单排除内部租约", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    const list = functionBody(migration, "branding_list_virtual_addon_refunds",
      "branding_get_virtual_addon_refund_detail");
    const detail = functionBody(migration,
      "branding_get_virtual_addon_refund_detail", "REVOKE ALL ON FUNCTION");
    for (const body of [list, detail]) {
      expect(body).not.toContain("refunds.*");
      expect(body).not.toContain("to_jsonb(refunds)");
      expect(body).not.toContain("'reconcile_claim_token'");
      expect(body).not.toContain("'reconcile_claim_expires_at'");
      expect(body).toContain("jsonb_build_object(");
    }
  });
});

function functionBody(migration: string, name: string, nextName: string): string {
  const start = migration.indexOf(`FUNCTION public.${name}`);
  const marker = nextName.startsWith("branding_")
    ? `FUNCTION public.${nextName}` : nextName;
  const end = migration.indexOf(marker, start + 1);
  return migration.slice(start, end);
}
