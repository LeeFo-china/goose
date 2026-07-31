import { beforeAll, describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { BrandingVirtualOrderRecord } from "@/repositories/branding-virtual-orders";
import type { AuthContext } from "@/services/authorization";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type ServiceConstructor = typeof import(
  "./tenant-branding-virtual-orders"
)["TenantBrandingVirtualOrderService"];
let TenantBrandingVirtualOrderService: ServiceConstructor;

beforeAll(async () => {
  ({ TenantBrandingVirtualOrderService } = await import(
    "./tenant-branding-virtual-orders"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";
const MAPPING_ID = "55555555-5555-4555-8555-555555555555";
const IDEMPOTENCY_KEY = "66666666-6666-4666-8666-666666666666";
const OPENID = "openid-from-login";
const NOW = new Date("2026-08-01T01:00:00.000Z");

const auth = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["system_admin"],
  roles: [],
  permissions: [{ code: "brand.entitlement.purchase", scope: "all" }],
} satisfies AuthContext;

const order = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  order_no: "BVO-20260801010000000-ABCDEF123456",
  out_trade_no: "BV20260801010000ABCDEF1234567890",
  idempotency_key: IDEMPOTENCY_KEY,
  product_id: "77777777-7777-4777-8777-777777777777",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  product_name: "年度品牌技术支持",
  amount_fen: 9_900,
  term_years: 1,
  purchase_notes: "支付成功后开通一年",
  refund_policy: "数字权益按规则退款",
  environment: "production",
  offer_id: "offer-1",
  provider_product_id: "provider-product-1",
  requested_platform: "ios",
  settlement_channel: null,
  payer_openid: OPENID,
  provider_order_no: null,
  transaction_id: null,
  payment_status: "pending",
  fulfillment_status: "pending",
  refund_status: "none",
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
  config_version: 3,
  secret_revision: 7,
  payment_expires_at: "2026-08-01T01:05:00.000Z",
  failure_code: null,
  failure_message: null,
  payment_request_claim_token: null,
  payment_request_claimed_at: null,
  payment_request_claim_expires_at: null,
  payment_request_issued_at: null,
  payment_request_attempt_revision: 0,
  created_by: EMPLOYEE_ID,
  created_at: "2026-08-01T01:00:00.000Z",
  updated_at: "2026-08-01T01:00:00.000Z",
} satisfies BrandingVirtualOrderRecord;

function fixture(overrides: {
  currentOrder?: BrandingVirtualOrderRecord | null;
  secretValues?: Record<string, string>;
} = {}) {
  const currentOrder = overrides.currentOrder === undefined
    ? order
    : overrides.currentOrder;
  const repository = {
    findProductionMapping: mock(
      async (_input: { productCode: typeof order.product_code }): Promise<{
        id: string;
        environment: "production";
        secret_revision: number;
      } | null> => ({
          id: MAPPING_ID,
          environment: "production",
          secret_revision: 7,
        }),
    ),
    create: mock(async (_input: {
      tenantId: string;
      idempotencyKey: string;
      virtualProductId: string;
      requestedPlatform: "android" | "harmony" | "windows" | "ios" | "unknown";
      payerOpenid: string;
      createdBy: string;
    }): Promise<BrandingVirtualOrderRecord> => order),
    findTenantOrderById: mock(async (_input: {
      tenantId: string;
      orderId: string;
    }): Promise<BrandingVirtualOrderRecord | null> => currentOrder),
    claimPaymentRequest: mock(async (_input: {
      tenantId: string;
      orderId: string;
      payerOpenid: string;
      createdBy: string;
    }): Promise<BrandingVirtualOrderRecord> => {
      if (!currentOrder) {
        throw Errors.business(404, "品牌权益虚拟支付订单不存在", "BRANDING_VIRTUAL_ORDER_NOT_FOUND");
      }
      if (currentOrder.payer_openid !== OPENID) {
        throw Errors.business(409, "该订单已绑定其他付款人", "BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH");
      }
      if (currentOrder.created_by !== EMPLOYEE_ID) {
        throw Errors.business(409, "该订单已绑定其他操作人", "BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH");
      }
      if (currentOrder.payment_status !== "pending") {
        throw Errors.business(409, "虚拟支付订单不是待支付状态", "BRANDING_VIRTUAL_ORDER_NOT_PENDING");
      }
      if (currentOrder.payment_expires_at <= NOW.toISOString()) {
        return { ...currentOrder, payment_status: "closed" };
      }
      return {
        ...currentOrder,
        payment_request_claim_token: "99999999-9999-4999-8999-999999999999",
        payment_request_claimed_at: NOW.toISOString(),
        payment_request_claim_expires_at: "2026-08-01T01:00:30.000Z",
      };
    }),
    finalizePaymentRequest: mock(async (): Promise<BrandingVirtualOrderRecord> => ({
      ...order,
      payment_request_issued_at: "2026-08-01T01:00:01.000Z",
      payment_request_attempt_revision: 1,
    })),
    releasePaymentRequestClaim: mock(async (): Promise<BrandingVirtualOrderRecord> => order),
  };
  const accessPolicy = {
    assertTenantContext: mock((context: AuthContext) => {
      if (!context.tenantId) throw Errors.forbidden();
      return context.tenantId;
    }),
    hasPermission: mock((context: AuthContext, permission: string) =>
      context.permissions.some((item) => item.code === permission)
    ),
  };
  const settingsService = {
    getPlatformSecretString: mock(async (key: string) => {
      const values = overrides.secretValues ?? {
        WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE: JSON.stringify({
          appKey: "sandbox-app-key",
          revision: 2,
        }),
        WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE: JSON.stringify({
        appKey: "production-app-key",
        revision: 7,
        }),
      };
      return values[key] ?? "";
    }),
  };
  const credentials = {
    getActiveForUser: mock(async () => ({
      credentialId: "credential-1",
      oauthIdentityId: "oauth-1",
      sessionKey: "session-key",
      sessionRevision: 4,
    })),
  };
  const service = new TenantBrandingVirtualOrderService({
    repository,
    accessPolicy,
    settingsService,
    credentials,
    nowFactory: () => NOW,
  });
  return { service, repository, accessPolicy, settingsService, credentials };
}

const createInput = {
  product_code: "custom_support_branding_annual" as const,
  idempotency_key: IDEMPOTENCY_KEY,
  requested_platform: "ios" as const,
};

describe("TenantBrandingVirtualOrderService createOrder", () => {
  test("creates only through the production mapping and RPC-owned snapshot", async () => {
    const f = fixture();
    const result = await f.service.createOrder(auth, createInput, OPENID);

    expect(f.repository.findProductionMapping).toHaveBeenCalledWith({
      productCode: createInput.product_code,
    });
    expect(f.repository.create).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      virtualProductId: MAPPING_ID,
      requestedPlatform: "ios",
      payerOpenid: OPENID,
      createdBy: EMPLOYEE_ID,
    });
    expect(result.order).toMatchObject({ id: ORDER_ID, amount_fen: 9_900 });
    expect(JSON.stringify(result)).not.toContain(OPENID);
    expect(JSON.stringify(result)).not.toContain("created_by");
    expect(JSON.stringify(result)).not.toContain("secret_revision");
  });

  test("reuses the same database fact for idempotent and pending requests", async () => {
    const f = fixture();
    expect(await f.service.createOrder(auth, createInput, OPENID)).toEqual(
      await f.service.createOrder(auth, createInput, OPENID),
    );
    expect(f.repository.create).toHaveBeenCalledTimes(2);
  });

  test("never changes the server price based on requested platform", async () => {
    const f = fixture();
    for (const requested_platform of ["android", "harmony", "ios"] as const) {
      const result = await f.service.createOrder(
        auth,
        { ...createInput, requested_platform },
        OPENID,
      );
      expect(result.order.amount_fen).toBe(9_900);
    }
    expect(f.repository.create.mock.calls.every(
      ([input]) => !("amountFen" in input) && !("amount_fen" in input),
    )).toBe(true);
  });

  test.each([
    [{ ...auth, roleCodes: [] }, "missing role"],
    [{ ...auth, permissions: [] }, "missing permission"],
    [{ ...auth, employeeId: null }, "missing employee"],
    [{ ...auth, authUserId: "" }, "missing auth user"],
    [{ ...auth, isPlatformAdmin: true }, "platform context"],
  ])("rejects a non-purchaser: %s", async (context) => {
    const f = fixture();
    await expect(f.service.createOrder(context, createInput, OPENID)).rejects
      .toMatchObject({
        statusCode: 403,
        code: "BRANDING_ENTITLEMENT_PURCHASE_FORBIDDEN",
      });
    expect(f.repository.findProductionMapping).not.toHaveBeenCalled();
  });

  test("maps an absent production mapping without calling the create RPC", async () => {
    const f = fixture();
    f.repository.findProductionMapping.mockResolvedValueOnce(null);
    await expect(f.service.createOrder(auth, createInput, OPENID)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE",
      });
    expect(f.repository.create).not.toHaveBeenCalled();
  });
});

describe("TenantBrandingVirtualOrderService createPaymentRequest", () => {
  test("builds a production virtual-payment request from server-owned inputs", async () => {
    const f = fixture();
    const result = await f.service.createPaymentRequest(auth, ORDER_ID, OPENID);

    expect(f.repository.claimPaymentRequest).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      payerOpenid: OPENID,
      createdBy: EMPLOYEE_ID,
    });
    expect(f.settingsService.getPlatformSecretString).toHaveBeenCalledTimes(1);
    expect(f.credentials.getActiveForUser).toHaveBeenCalledWith({
      userId: USER_ID,
      openid: OPENID,
    });
    expect(result.payment_request).toMatchObject({
      kind: "wechat_virtual",
      environment: "production",
      request_payload: { mode: "short_series_goods" },
    });
    const signData = JSON.parse(result.payment_request.request_payload.signData);
    expect(signData).toEqual({
      offerId: order.offer_id,
      buyQuantity: 1,
      env: 0,
      currencyType: "CNY",
      productId: order.provider_product_id,
      goodsPrice: order.amount_fen,
      outTradeNo: order.out_trade_no,
      attach: order.id,
    });
    const serialized = JSON.stringify(result);
    for (const secret of [OPENID, "production-app-key", "session-key", "secret_revision", "created_by"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  test("returns tenant-scoped not found before loading payment material", async () => {
    const f = fixture({ currentOrder: null });
    await expect(f.service.createPaymentRequest(auth, ORDER_ID, OPENID)).rejects
      .toMatchObject({ statusCode: 404, code: "BRANDING_VIRTUAL_ORDER_NOT_FOUND" });
    expect(f.settingsService.getPlatformSecretString).not.toHaveBeenCalled();
    expect(f.credentials.getActiveForUser).not.toHaveBeenCalled();
  });

  const unsafeOrderCases: Array<[BrandingVirtualOrderRecord, string]> = [
    [{ ...order, payer_openid: "another-openid" }, "BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH"],
    [{ ...order, created_by: "88888888-8888-4888-8888-888888888888" }, "BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH"],
    [{ ...order, payment_status: "closed" }, "BRANDING_VIRTUAL_ORDER_NOT_PENDING"],
    [{ ...order, payment_expires_at: NOW.toISOString() }, "BRANDING_VIRTUAL_ORDER_EXPIRED"],
  ];

  test.each(unsafeOrderCases)("rejects unsafe order state before secrets: %s", async (currentOrder, code) => {
    const f = fixture({ currentOrder });
    await expect(f.service.createPaymentRequest(auth, ORDER_ID, OPENID)).rejects
      .toMatchObject({ statusCode: 409, code });
    expect(f.settingsService.getPlatformSecretString).not.toHaveBeenCalled();
    expect(f.credentials.getActiveForUser).not.toHaveBeenCalled();
  });

  test.each([
    ["", "missing"],
    [JSON.stringify({ appKey: "key", revision: 8 }), "revision mismatch"],
    [JSON.stringify({ appKey: "", revision: 7 }), "invalid"],
  ])("rejects an invalid bound production secret: %s", async (value) => {
    const f = fixture({
      secretValues: {
        WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE: "",
        WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE: value,
      },
    });
    await expect(f.service.createPaymentRequest(auth, ORDER_ID, OPENID)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PAYMENT_SECRET_INVALID",
      });
    expect(f.credentials.getActiveForUser).not.toHaveBeenCalled();
  });

  test("preserves sanitized infrastructure failures when loading secrets", async () => {
    const f = fixture();
    const failure = Errors.dbError("读取平台支付密钥配置失败");
    f.settingsService.getPlatformSecretString.mockRejectedValueOnce(failure);
    await expect(f.service.createPaymentRequest(auth, ORDER_ID, OPENID))
      .rejects.toBe(failure);
    expect(f.credentials.getActiveForUser).not.toHaveBeenCalled();
  });

  test("requires a fresh wx.login credential without creating another order", async () => {
    const f = fixture();
    f.credentials.getActiveForUser.mockRejectedValueOnce(Errors.business(
      409,
      "微信会话已失效，请重新登录",
      "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
    ));
    await expect(f.service.createPaymentRequest(auth, ORDER_ID, OPENID)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
      });
    expect(f.repository.create).not.toHaveBeenCalled();
  });
});
