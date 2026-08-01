import { describe, expect, mock, test } from "bun:test";

import type { BrandingVirtualRefundRepository } from "./branding-virtual-refunds";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const REFUND_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
const IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";

describe("BrandingVirtualRefundRepository", () => {
  test("创建命令只提交服务端确定的全额退款事实", async () => {
    const BrandingVirtualRefundRepository = await repositoryClass();
    const rpc = mock(async () => ({ data: [refundRow()], error: null }));
    const repository = new BrandingVirtualRefundRepository(() => ({ rpc }));

    const refund = await repository.create({
      orderId: ORDER_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "用户提交了售后证据",
      evidenceSummary: "后台工单 #A-1",
      requestedBy: EMPLOYEE_ID,
    });

    expect(refund.id).toBe(REFUND_ID);
    expect(rpc).toHaveBeenCalledWith(
      "branding_create_virtual_addon_refund",
      {
        p_order_id: ORDER_ID,
        p_idempotency_key: IDEMPOTENCY_KEY,
        p_reason: "用户提交了售后证据",
        p_evidence_summary: "后台工单 #A-1",
        p_requested_by: EMPLOYEE_ID,
      },
    );
  });

  test("列表分页被限制在一百并拒绝无界结果", async () => {
    const BrandingVirtualRefundRepository = await repositoryClass();
    const rpc = mock(async () => ({
      data: [{ ...refundRow(), total_count: "1", count_only: false }],
      error: null,
    }));
    const repository = new BrandingVirtualRefundRepository(() => ({ rpc }));

    const result = await repository.list({ page: 1, pageSize: 500 });

    expect(rpc).toHaveBeenCalledWith(
      "branding_list_virtual_addon_refunds",
      expect.objectContaining({ p_page: 1, p_page_size: 100 }),
    );
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    });
    expect(result.list[0]).toMatchObject({
      tenant_name: "示例装企",
      out_trade_no: "BV202608010001",
      provider_order_type: 0,
      provider_channel: "merchant",
      environment: "production",
      product_name: "年度品牌技术支持",
    });
    expect(JSON.stringify(result.list[0])).not.toContain("openid-1");
  });

  test("只记录微信查单确认的支付 order_type 事实", async () => {
    const BrandingVirtualRefundRepository = await repositoryClass();
    const rpc = mock(async () => ({ data: true, error: null }));
    const repository = new BrandingVirtualRefundRepository(() => ({ rpc }));

    expect(await repository.recordProviderOrderTypeFact({
      orderId: ORDER_ID,
      officialStatus: 2,
      providerOrderType: 7,
      outTradeNo: "BV202608010001",
      environment: "production",
      providerOrderNo: "wx-order-1",
      orderFeeFen: 100,
      paidFeeFen: 100,
      leftFeeFen: 100,
    })).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "branding_record_virtual_order_type_fact",
      {
        p_order_id: ORDER_ID,
        p_official_status: 2,
        p_provider_order_type: 7,
        p_out_trade_no: "BV202608010001",
        p_environment: "production",
        p_provider_order_no: "wx-order-1",
        p_order_fee_fen: 100,
        p_paid_fee_fen: 100,
        p_left_fee_fen: 100,
      },
    );
  });

  test("补偿命令使用退款ID且返回同一反向事件", async () => {
    const BrandingVirtualRefundRepository = await repositoryClass();
    const rpc = mock(async () => ({
      data: [{
        refund_id: REFUND_ID,
        compensation_status: "succeeded",
        compensation_entitlement_event_id:
          "55555555-5555-4555-8555-555555555555",
      }],
      error: null,
    }));
    const repository = new BrandingVirtualRefundRepository(() => ({ rpc }));

    const result = await repository.compensate({ refundId: REFUND_ID });

    expect(rpc).toHaveBeenCalledWith(
      "branding_compensate_virtual_addon_refund",
      { p_refund_id: REFUND_ID },
    );
    expect(result.compensation_status).toBe("succeeded");
  });
});

async function repositoryClass(): Promise<
  typeof BrandingVirtualRefundRepository
> {
  return (await import("./branding-virtual-refunds"))
    .BrandingVirtualRefundRepository;
}

function refundRow() {
  return {
    id: REFUND_ID,
    refund_no: "BVR202608010001",
    order_id: ORDER_ID,
    tenant_id: "66666666-6666-4666-8666-666666666666",
    idempotency_key: IDEMPOTENCY_KEY,
    amount_fen: 100,
    reason: "用户提交了售后证据",
    evidence_summary: "后台工单 #A-1",
    request_source: "platform_admin" as const,
    requested_by: EMPLOYEE_ID,
    reviewed_by: EMPLOYEE_ID,
    platform_mode: "merchant_initiated" as const,
    status: "reviewing" as const,
    provider_refund_id: null,
    provider_refund_transaction_id: null,
    provider_request_id: null,
    apple_receipt_hash: null,
    purchase_entitlement_event_id:
      "77777777-7777-4777-8777-777777777777",
    compensation_entitlement_event_id: null,
    submitted_at: null,
    succeeded_at: null,
    failed_at: null,
    rejected_at: null,
    last_error_code: null,
    last_error_summary: null,
    compensation_status: "pending" as const,
    compensation_last_error: null,
    reconcile_claim_token: null,
    reconcile_claim_expires_at: null,
    reconcile_attempt_count: 0,
    reconcile_next_at: null,
    version: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    tenant_name: "示例装企",
    out_trade_no: "BV202608010001",
    provider_order_type: 0 as const,
    provider_channel: "merchant" as const,
    environment: "production" as const,
    product_name: "年度品牌技术支持",
    order: {
      out_trade_no: "BV202608010001",
      provider_order_type: 0 as const,
      provider_channel: "merchant" as const,
      environment: "production" as const,
      payer_openid: "openid-1",
      provider_order_no: "wx-order-1",
      transaction_id: "wxpay-order-1",
      payment_status: "succeeded" as const,
      fulfillment_status: "granted" as const,
      refund_status: "reviewing" as const,
      paid_amount_fen: 100,
      paid_at: "2026-08-01T00:00:00.000Z",
      secret_revision: 1,
      created_by_user_id: "88888888-8888-4888-8888-888888888888",
    },
  };
}
