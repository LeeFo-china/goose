import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

describe("BrandingEntitlementOrderQueryRepository", () => {
  test("uses one bounded RPC for a filtered platform page", async () => {
    const rpc = mock(async () => ({
      data: [{
        payment_channel: "wechat_virtual",
        payment_platform: "ios",
        payment_status: "succeeded",
        fulfillment_status: "granted",
        refund_status: "none",
        id: ORDER_ID,
        tenant_id: TENANT_ID,
        order_no: "BVO-20260731-1",
        product_code: "custom_support_branding_annual",
        product_name: "年度品牌技术支持",
        amount_fen: 100,
        term_years: 1,
        payment_expires_at: "2026-07-31T08:05:00.000Z",
        paid_at: "2026-07-31T08:01:00.000Z",
        closed_at: null,
        failure_code: null,
        created_at: "2026-07-31T08:00:00.000Z",
        updated_at: "2026-07-31T08:01:00.000Z",
        tenant_name: "测试租户",
        tenant_slug: "test-tenant",
        entitlement_starts_at: "2026-07-31T08:01:00.000Z",
        entitlement_expires_at: "2027-07-31T08:01:00.000Z",
        entitlement_status: "active",
        entitlement_source: "purchase",
        entitlement_source_id: ORDER_ID,
        total_count: 1,
        count_only: false,
        payer_openid: "sensitive-openid",
        metadata: { secret: "must-not-leak" },
      }],
      error: null,
    }));
    const { BrandingEntitlementOrderQueryRepository } = await import(
      "./branding-entitlement-order-query"
    );
    const repository = new BrandingEntitlementOrderQueryRepository(
      () => ({ rpc }),
    );

    const result = await repository.list({
      tenantId: null,
      page: 2,
      pageSize: 100,
      paymentChannel: "wechat_virtual",
      paymentStatus: "succeeded",
      fulfillmentStatus: "granted",
      refundStatus: "none",
      keyword: "BVO-20260731",
      createdFrom: "2026-07-01T00:00:00.000Z",
      createdTo: "2026-07-31T23:59:59.999Z",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("branding_list_entitlement_orders", {
      p_tenant_id: null,
      p_page: 2,
      p_page_size: 100,
      p_payment_channel: "wechat_virtual",
      p_payment_status: "succeeded",
      p_fulfillment_status: "granted",
      p_refund_status: "none",
      p_keyword: "BVO-20260731",
      p_created_from: "2026-07-01T00:00:00.000Z",
      p_created_to: "2026-07-31T23:59:59.999Z",
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    });
    expect(result.list[0]).not.toHaveProperty("total_count");
    expect(JSON.stringify(result)).not.toContain("sensitive-openid");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  test("routes tenant detail through one tenant-scoped RPC", async () => {
    const rpc = mock(async () => ({
      data: {
        payment_channel: "legacy_direct",
        order: {
          payment_channel: "legacy_direct",
          payment_platform: "unknown",
          payment_status: "pending",
          fulfillment_status: "pending",
          refund_status: "none",
          id: ORDER_ID,
          tenant_id: TENANT_ID,
          order_no: "BA202607310001",
          product_code: "custom_support_branding_annual",
          product_name: "年度品牌技术支持",
          amount_fen: 100,
          term_years: 1,
          payment_expires_at: "2026-07-31T08:05:00.000Z",
          paid_at: null,
          closed_at: null,
          failure_code: null,
          created_at: "2026-07-31T08:00:00.000Z",
          updated_at: "2026-07-31T08:00:00.000Z",
          tenant_name: "测试租户",
          tenant_slug: "test-tenant",
          entitlement_starts_at: null,
          entitlement_expires_at: null,
          entitlement_status: null,
          entitlement_source: null,
          entitlement_source_id: null,
          out_trade_no: "BA202607310001WX",
          entitlement_code: "custom_support_branding",
          purchase_notes: "支付成功后自动开通一年",
          refund_policy: "支付成功后不支持退款",
          paid_amount_fen: null,
          failure_message: null,
          entitlement_event_id: null,
          created_by: "11111111-1111-4111-8111-111111111111",
          channel: "wechat_pay",
          transaction_id: null,
        },
        entitlement: null,
        entitlement_event: null,
        audit: null,
        audit_summary: {
          source: "legacy_order",
          payment_status: "pending",
          fulfillment_status: "pending",
          refund_status: "none",
        },
      },
      error: null,
    }));
    const { BrandingEntitlementOrderQueryRepository } = await import(
      "./branding-entitlement-order-query"
    );
    const repository = new BrandingEntitlementOrderQueryRepository(
      () => ({ rpc }),
    );

    const result = await repository.findDetail({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("branding_get_entitlement_order_detail", {
      p_tenant_id: TENANT_ID,
      p_order_id: ORDER_ID,
    });
    expect(result?.payment_channel).toBe("legacy_direct");
  });

  test("keeps the total for an out-of-range page and removes its sentinel", async () => {
    const rpc = mock(async () => ({
      data: [{
        count_only: true,
        id: null,
        total_count: 37,
      }],
      error: null,
    }));
    const { BrandingEntitlementOrderQueryRepository } = await import(
      "./branding-entitlement-order-query"
    );
    const repository = new BrandingEntitlementOrderQueryRepository(
      () => ({ rpc }),
    );

    const result = await repository.list({
      tenantId: TENANT_ID,
      page: 3,
      pageSize: 20,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      list: [],
      pagination: {
        page: 3,
        pageSize: 20,
        total: 37,
        totalPages: 2,
      },
    });
  });

  test("distinguishes a truly empty result from a missing count", async () => {
    const rpc = mock(async () => ({
      data: [{
        count_only: true,
        id: null,
        total_count: 0,
      }],
      error: null,
    }));
    const { BrandingEntitlementOrderQueryRepository } = await import(
      "./branding-entitlement-order-query"
    );
    const repository = new BrandingEntitlementOrderQueryRepository(
      () => ({ rpc }),
    );

    const result = await repository.list({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.list).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  test("sanitizes unknown database diagnostics", async () => {
    const rpc = mock(async () => ({
      data: null,
      error: {
        message: "select payer_openid, payment_config_id",
        details: "private database layout",
      },
    }));
    const { BrandingEntitlementOrderQueryRepository } = await import(
      "./branding-entitlement-order-query"
    );
    const repository = new BrandingEntitlementOrderQueryRepository(
      () => ({ rpc }),
    );

    await expect(repository.list({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
  });
});

describe("branding entitlement order query migration contract", () => {
  test("uses one bounded union query with tenant scope and service-only RPCs", () => {
    const migration = readFileSync(resolve(
      import.meta.dir,
      "../../../../supabase/migrations/20260731134000_create_branding_entitlement_order_query.sql",
    ), "utf8");

    expect(migration).toContain("branding_list_entitlement_orders");
    expect(migration).toContain("branding_get_entitlement_order_detail");
    expect(migration).toContain("UNION ALL");
    expect(migration).toMatch(
      /statistics AS \(\s*SELECT count\(\*\)::bigint AS total_count\s+FROM filtered/i,
    );
    expect(migration).toContain("count_only boolean");
    expect(migration).toMatch(/NULL::uuid AS id[\s\S]*true AS count_only/i);
    expect(migration).toMatch(/NOT EXISTS \(SELECT 1 FROM paged\)/i);
    expect(migration).toMatch(
      /WHERE \(p_tenant_id IS NULL OR unified\.tenant_id = p_tenant_id\)/i,
    );
    expect(migration).toMatch(
      /ORDER BY filtered\.created_at DESC, filtered\.id DESC\s+OFFSET[\s\S]*LIMIT LEAST\(GREATEST\(COALESCE\(p_page_size, 20\), 1\), 100\)/i,
    );
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration.match(/SET search_path = pg_catalog, public/g))
      .toHaveLength(2);
    expect(migration).not.toContain("SET search_path = public, pg_temp");
    expect(migration).not.toContain("wechat_virtual_payment_notifications");
    expect(migration).not.toContain("reconcile_query_");
  });
});
