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
const CLAIM_TOKEN = "66666666-6666-4666-8666-666666666666";
const IDEMPOTENCY_KEY = "77777777-7777-4777-8777-777777777777";
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
  product_id: "88888888-8888-4888-8888-888888888888",
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

const claimedOrder: BrandingVirtualOrderRecord = {
  ...order,
  payment_request_claim_token: CLAIM_TOKEN,
  payment_request_claimed_at: "2026-08-01T01:00:00.000Z",
  payment_request_claim_expires_at: "2026-08-01T01:00:30.000Z",
};
const finalizedOrder: BrandingVirtualOrderRecord = {
  ...order,
  payment_request_issued_at: "2026-08-01T01:00:01.000Z",
  payment_request_attempt_revision: 1,
};

function fixture() {
  const events: string[] = [];
  const repository = {
    findProductionMapping: mock(async () => ({
      id: MAPPING_ID,
      environment: "production" as const,
      secret_revision: 7,
    })),
    findProductionMappingId: mock(async () => MAPPING_ID),
    create: mock(async () => order),
    findTenantOrderById: mock(async () => order),
    claimPaymentRequest: mock(async () => {
      events.push("claim");
      return claimedOrder;
    }),
    finalizePaymentRequest: mock(async () => {
      events.push("finalize");
      return finalizedOrder;
    }),
    releasePaymentRequestClaim: mock(async () => {
      events.push("release");
      return order;
    }),
  };
  const settingsService = {
    getPlatformSecretString: mock(async () => {
      events.push("secret");
      return JSON.stringify({ appKey: "production-app-key", revision: 7 });
    }),
    getPlatformSecretStrings: mock(async () => {
      events.push("forbidden-batch-secret-read");
      throw Errors.dbError("不得批量读取签发密钥");
    }),
  };
  const credentials = {
    getActiveForUser: mock(async () => {
      events.push("credential");
      return {
        credentialId: "credential-1",
        oauthIdentityId: "oauth-1",
        sessionKey: "session-key",
        sessionRevision: 4,
      };
    }),
  };
  const accessPolicy = {
    assertTenantContext: mock(() => TENANT_ID),
    hasPermission: mock(() => true),
  };
  const service = new TenantBrandingVirtualOrderService({
    repository,
    settingsService,
    credentials,
    accessPolicy,
    nowFactory: () => NOW,
  });
  return { service, repository, settingsService, credentials, events };
}

describe("virtual payment request claim lifecycle", () => {
  test("claims before secrets and finalizes only after the request is built", async () => {
    const f = fixture();
    const result = await f.service.createPaymentRequest(auth, ORDER_ID, OPENID);

    expect(f.events).toEqual(["claim", "secret", "credential", "finalize"]);
    expect(f.repository.claimPaymentRequest).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      payerOpenid: OPENID,
      createdBy: EMPLOYEE_ID,
    });
    expect(f.repository.finalizePaymentRequest).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      payerOpenid: OPENID,
      createdBy: EMPLOYEE_ID,
      claimToken: CLAIM_TOKEN,
    });
    expect(result.order).toMatchObject({ id: ORDER_ID, payment_status: "pending" });
    expect(result.payment_request.request_payload.mode).toBe("short_series_goods");
  });

  test("returns no signed payload when finalize fails and releases the claim", async () => {
    const f = fixture();
    const finalizeFailure = Errors.business(
      409,
      "虚拟支付配置已变化",
      "BRANDING_VIRTUAL_ORDER_CONFIG_CHANGED",
    );
    f.repository.finalizePaymentRequest.mockImplementationOnce(async () => {
      f.events.push("finalize");
      throw finalizeFailure;
    });

    await expect(f.service.createPaymentRequest(auth, ORDER_ID, OPENID))
      .rejects.toBe(finalizeFailure);
    expect(f.events).toEqual([
      "claim",
      "secret",
      "credential",
      "finalize",
      "release",
    ]);
  });

  test("does not let a best-effort release failure mask the signing failure", async () => {
    const f = fixture();
    const signingFailure = Errors.business(
      409,
      "微信会话已失效，请重新登录",
      "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
    );
    f.credentials.getActiveForUser.mockImplementationOnce(async () => {
      f.events.push("credential");
      throw signingFailure;
    });
    f.repository.releasePaymentRequestClaim.mockImplementationOnce(async () => {
      f.events.push("release");
      throw Errors.dbError("释放签发租约失败");
    });

    await expect(f.service.createPaymentRequest(auth, ORDER_ID, OPENID))
      .rejects.toBe(signingFailure);
    expect(f.events).toEqual(["claim", "secret", "credential", "release"]);
    expect(f.repository.finalizePaymentRequest).not.toHaveBeenCalled();
  });

  test("turns a terminal claim result into an expired error without reading secrets", async () => {
    const f = fixture();
    f.repository.claimPaymentRequest.mockImplementationOnce(async () => {
      f.events.push("claim");
      return { ...order, payment_status: "closed" };
    });

    await expect(f.service.createPaymentRequest(auth, ORDER_ID, OPENID))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_ORDER_EXPIRED",
      });
    expect(f.events).toEqual(["claim"]);
  });
});

describe("exact environment secret preflight", () => {
  test("validates only the production secret before creating an order", async () => {
    const f = fixture();
    await f.service.createOrder(auth, {
      product_code: "custom_support_branding_annual",
      idempotency_key: IDEMPOTENCY_KEY,
      requested_platform: "ios",
    }, OPENID);

    expect(f.settingsService.getPlatformSecretString).toHaveBeenCalledWith(
      "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    );
    expect(f.settingsService.getPlatformSecretStrings).not.toHaveBeenCalled();
    expect(f.repository.create).toHaveBeenCalledTimes(1);
  });

  test("does not create a pending order when the exact secret is absent", async () => {
    const f = fixture();
    f.settingsService.getPlatformSecretString.mockResolvedValueOnce("");

    await expect(f.service.createOrder(auth, {
      product_code: "custom_support_branding_annual",
      idempotency_key: IDEMPOTENCY_KEY,
      requested_platform: "unknown",
    }, OPENID)).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SECRET_INVALID",
    });
    expect(f.repository.create).not.toHaveBeenCalled();
  });
});
