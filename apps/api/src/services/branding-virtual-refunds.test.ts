import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const REFUND_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const ADMIN_USER_ID = "99999999-9999-4999-8999-999999999999";
const CLAIM_TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("BrandingVirtualRefundService", () => {
  test.each([
    [0, "merchant_initiated", "submitted", 1],
    [7, "apple_external", "external_required", 0],
  ] as const)(
    "只按微信可信 order_type=%i 路由退款",
    async (providerOrderType, mode, status, gatewayCalls) => {
      const harness = createHarness(providerOrderType);
      const { BrandingVirtualRefundService } = await import(
        "./branding-virtual-refunds"
      );
      const service = new BrandingVirtualRefundService(harness);

      const result = await service.create(platformAdmin(), {
        order_id: ORDER_ID,
        idempotency_key: "55555555-5555-4555-8555-555555555555",
        reason: "用户申请全额退款",
        evidence_summary: "客服工单已核验",
      });

      expect(result).toMatchObject({ platform_mode: mode, status });
      expect(harness.gateway.refundOrder).toHaveBeenCalledTimes(gatewayCalls);
    },
  );

  test("缺少独立退款权限时在读取订单前拒绝", async () => {
    const harness = createHarness(0);
    harness.accessPolicy.assertPermission.mockImplementation(() => {
      throw Object.assign(new Error("forbidden"), { code: "FORBIDDEN" });
    });
    const { BrandingVirtualRefundService } = await import(
      "./branding-virtual-refunds"
    );
    const service = new BrandingVirtualRefundService(harness);

    await expect(service.create(platformAdmin(), createInput())).rejects
      .toMatchObject({ code: "FORBIDDEN" });
    expect(harness.repository.findOrderContext).not.toHaveBeenCalled();
  });

  test.each([
    ["未支付", { payment_status: "pending" }],
    ["非全额支付", { paid_amount_fen: 99 }],
    ["已成功退款", { refund_status: "succeeded" }],
  ] as const)("%s订单在微信查单前拒绝", async (_label, patch) => {
    const harness = createHarness(0);
    const context = await harness.repository.findOrderContext();
    harness.repository.findOrderContext.mockClear();
    harness.repository.findOrderContext.mockResolvedValueOnce({
      ...context, ...patch,
    } as never);
    const { BrandingVirtualRefundService } = await import(
      "./branding-virtual-refunds"
    );
    const service = new BrandingVirtualRefundService(harness);

    await expect(service.create(platformAdmin(), createInput())).rejects
      .toMatchObject({ code: "refund_status" in patch
        ? "BRANDING_VIRTUAL_REFUND_ALREADY_EXISTS"
        : "BRANDING_VIRTUAL_REFUND_ORDER_NOT_REFUNDABLE" });
    expect(harness.gateway.queryOrder).not.toHaveBeenCalled();
    expect(harness.repository.create).not.toHaveBeenCalled();
  });

  test("微信已退款或金额事实不一致时拒绝创建本地退款", async () => {
    for (const providerPatch of [
      { status: 5 as const },
      { paidFee: 99 },
      { orderType: 1 as const },
    ]) {
      const harness = createHarness(0);
      const fact = await harness.gateway.queryOrder();
      harness.gateway.queryOrder.mockClear();
      harness.gateway.queryOrder.mockResolvedValueOnce({
        ...fact, ...providerPatch,
      } as never);
      const { BrandingVirtualRefundService } = await import(
        "./branding-virtual-refunds"
      );
      const service = new BrandingVirtualRefundService(harness);
      await expect(service.create(platformAdmin(), createInput())).rejects
        .toMatchObject({ code: "BRANDING_VIRTUAL_REFUND_PROVIDER_FACT_CONFLICT" });
      expect(harness.repository.recordProviderOrderTypeFact).not.toHaveBeenCalled();
      expect(harness.repository.create).not.toHaveBeenCalled();
    }
  });

  test("重复幂等请求在已提交后不重复调用微信", async () => {
    const harness = createHarness(0, "submitted");
    const { BrandingVirtualRefundService } = await import(
      "./branding-virtual-refunds"
    );
    const service = new BrandingVirtualRefundService(harness);

    const result = await service.create(platformAdmin(), createInput());

    expect(result.status).toBe("submitted");
    expect(harness.gateway.queryOrder).not.toHaveBeenCalled();
    expect(harness.repository.recordProviderOrderTypeFact).not.toHaveBeenCalled();
    expect(harness.gateway.refundOrder).not.toHaveBeenCalled();
  });

  test("付款人凭据缺失时保持 reviewing 且同一申请可恢复", async () => {
    const harness = createHarness(0);
    harness.credentials.getActiveForUser
      .mockRejectedValueOnce(Object.assign(new Error("refresh"), {
        code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
      }));
    const { BrandingVirtualRefundService } = await import(
      "./branding-virtual-refunds"
    );
    const service = new BrandingVirtualRefundService(harness);

    await expect(service.create(platformAdmin(), createInput())).rejects
      .toMatchObject({
        code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
      });
    expect(harness.gateway.refundOrder).not.toHaveBeenCalled();
    expect(harness.repository.markSubmitted).not.toHaveBeenCalled();
    expect(harness.repository.releaseSubmissionClaim).toHaveBeenCalledWith({
      refundId: REFUND_ID,
      claimToken: CLAIM_TOKEN,
    });

    const recovered = await service.create(platformAdmin(), createInput());
    expect(recovered.status).toBe("submitted");
    expect(harness.repository.create).toHaveBeenCalledTimes(2);
    expect(harness.gateway.refundOrder).toHaveBeenCalledTimes(1);
  });

  test("只用订单付款人的用户与 openid 获取凭据并签署退款", async () => {
    const harness = createHarness(0);
    const { BrandingVirtualRefundService } = await import(
      "./branding-virtual-refunds"
    );
    const service = new BrandingVirtualRefundService(harness);

    await service.create(platformAdmin(), createInput());

    expect(harness.credentials.getActiveForUser).toHaveBeenCalledWith({
      userId: USER_ID,
      openid: "openid-1",
    });
    expect(harness.gateway.refundOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        openid: "openid-1",
        credential: expect.objectContaining({ userId: USER_ID }),
      }),
    );
    expect(JSON.stringify(harness.gateway.refundOrder.mock.calls))
      .not.toContain(ADMIN_USER_ID);
  });

  test("同一幂等退款并发只允许一个 submission claim 调用微信", async () => {
    const harness = createHarness(0);
    harness.repository.claimSubmission
      .mockResolvedValueOnce({ refund: await harness.repository.create(),
        claimToken: CLAIM_TOKEN })
      .mockResolvedValueOnce(null);
    harness.repository.create.mockClear();
    const { BrandingVirtualRefundService } = await import(
      "./branding-virtual-refunds"
    );
    const service = new BrandingVirtualRefundService(harness);

    const [first, second] = await Promise.all([
      service.create(platformAdmin(), createInput()),
      service.create(platformAdmin(), createInput()),
    ]);

    expect([first.status, second.status]).toContain("submitted");
    expect(harness.gateway.refundOrder).toHaveBeenCalledTimes(1);
    expect(harness.repository.renewSubmissionClaim).toHaveBeenCalledTimes(1);
  });
});

function createHarness(
  providerOrderTypeFact: 0 | 7,
  existingStatus?: "submitted",
) {
  let providerOrderType: 0 | 7 | null = existingStatus
    ? providerOrderTypeFact
    : null;
  const context = {
    id: ORDER_ID,
    tenant_id: "66666666-6666-4666-8666-666666666666",
    out_trade_no: "BV202608010001",
    environment: "production" as const,
    provider_order_type: providerOrderType,
    payer_openid: "openid-1",
    provider_order_no: "wx-order-1",
    payment_status: "succeeded" as const,
    fulfillment_status: "granted" as const,
    refund_status: existingStatus ? "submitted" as const : "none" as const,
    amount_fen: 100,
    paid_amount_fen: 100,
    paid_at: "2026-08-01T00:00:00.000Z",
    entitlement_event_id: "77777777-7777-4777-8777-777777777777",
    secret_revision: 1,
    created_by_user_id: USER_ID,
  };
  const refund = {
    id: REFUND_ID,
    refund_no: "BVR202608010001",
    order_id: ORDER_ID,
    tenant_id: context.tenant_id,
    idempotency_key: "55555555-5555-4555-8555-555555555555",
    amount_fen: 100,
    reason: "用户申请全额退款",
    evidence_summary: "客服工单已核验",
    request_source: "platform_admin" as const,
    requested_by: ACTOR_ID,
    reviewed_by: ACTOR_ID,
    platform_mode: providerOrderTypeFact === 7 ? "apple_external" as const :
      "merchant_initiated" as const,
    status: providerOrderTypeFact === 7 ? "external_required" as const :
      existingStatus ?? "reviewing" as const,
    provider_refund_id: existingStatus ? "refund-wx-1" : null,
    provider_refund_no: existingStatus ? "BVR202608010001" : null,
    provider_refund_transaction_id: null,
    provider_request_id: null,
    apple_receipt_hash: null,
    purchase_entitlement_event_id: context.entitlement_event_id,
    compensation_entitlement_event_id: null,
    provider_refund_started_at: null,
    provider_refund_succeeded_at: null,
    submitted_at: existingStatus ? "2026-08-01T00:01:00.000Z" : null,
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
  };
  const claimSubmission = mock(async (): Promise<{
    refund: typeof refund;
    claimToken: string;
  } | null> => ({ refund, claimToken: CLAIM_TOKEN }));
  const repository = {
    findOrderContext: mock(async () => ({
      ...context,
      provider_order_type: providerOrderType,
    })),
    recordProviderOrderTypeFact: mock(async (fact: { providerOrderType: 0 | 7 }) => {
      providerOrderType = fact.providerOrderType;
      return true;
    }),
    create: mock(async () => refund),
    markSubmitted: mock(async () => ({
      ...refund,
      status: "submitted" as const,
      provider_refund_id: "refund-wx-1",
      provider_refund_no: "BVR202608010001",
      submitted_at: "2026-08-01T00:01:00.000Z",
    })),
    claimSubmission,
    renewSubmissionClaim: mock(async () => true),
    releaseSubmissionClaim: mock(async () => true),
    list: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    findDetail: mock(async () => ({
      ...refund,
      order: {
        out_trade_no: context.out_trade_no,
        provider_order_type: providerOrderTypeFact,
        provider_channel: providerOrderTypeFact === 7
          ? "apple" as const : "merchant" as const,
        environment: context.environment,
        provider_order_no: context.provider_order_no,
        transaction_id: null,
        payment_status: context.payment_status,
        fulfillment_status: context.fulfillment_status,
        refund_status: context.refund_status,
        paid_amount_fen: context.paid_amount_fen,
        paid_at: context.paid_at,
      },
    })),
  };
  return {
    repository,
    accessPolicy: { assertPermission: mock(() => "all" as const) },
    gateway: {
      queryOrder: mock(async () => ({
        requestId: "query-1",
        environment: context.environment,
        orderId: context.out_trade_no,
        status: 2 as const,
        businessType: 0 as const,
        orderType: providerOrderTypeFact,
        orderFee: 100,
        couponFee: null,
        paidFee: 100,
        refundFee: 0,
        leftFee: 100,
        createdAt: 1,
        updatedAt: 2,
        paidAt: 1,
        providedAt: 1,
        wechatOrderId: context.provider_order_no,
        channelOrderId: null,
        wechatPayOrderId: null,
        settledAt: null,
        settlementState: null,
        platformFeeFen: null,
        cpsFeeFen: null,
      })),
      refundOrder: mock(async () => ({
        status: "submitted" as const,
        requestId: "request-1",
        refundOrderId: refund.refund_no,
        refundWechatOrderId: "refund-wx-1",
        payOrderId: context.out_trade_no,
        payWechatOrderId: context.provider_order_no,
      })),
    },
    credentials: {
      getActiveForUser: mock(async () => ({
        credentialId: "credential-1",
        oauthIdentityId: "identity-1",
        sessionKey: "session-key",
        sessionRevision: 1,
      })),
    },
    accessTokenProvider: { getAccessToken: mock(async () => "access-token") },
    settingsService: {
      getPlatformSecretString: mock(async () =>
        JSON.stringify({ appKey: "app-key", revision: 1 })
      ),
    },
    audit: { recordBestEffort: mock(async () => null) },
  };
}

function createInput() {
  return {
    order_id: ORDER_ID,
    idempotency_key: "55555555-5555-4555-8555-555555555555",
    reason: "用户申请全额退款",
    evidence_summary: "客服工单已核验",
  };
}

function platformAdmin(): AuthContext {
  return {
    authUserId: ADMIN_USER_ID,
    employeeId: ACTOR_ID,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [{
      code: "platform.virtual_refund.manage",
      scope: "all",
    }],
  };
}
