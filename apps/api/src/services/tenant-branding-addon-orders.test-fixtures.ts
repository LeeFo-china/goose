import { mock } from "bun:test";

import type { BrandingAddonOrderRecord } from "@/repositories/branding-addon-orders";
import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { TenantEntitlementRecord } from "@/repositories/tenant-entitlements";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

export const TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";
export const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
export const AUTH_USER_ID = "44444444-4444-4444-8444-444444444444";
export const ORDER_ID = "55555555-5555-4555-8555-555555555555";
export const PRODUCT_ID = "66666666-6666-4666-8666-666666666666";
export const CONFIG_ID = "77777777-7777-4777-8777-777777777777";
export const IDEMPOTENCY_KEY = "88888888-8888-4888-8888-888888888888";
export const NOW = new Date("2026-07-28T02:00:00.000Z");

export const authContext = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "租户管理员",
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
  permissions: [
    { code: "brand.entitlement.purchase", scope: "all" },
    { code: "brand.entitlement_order.read", scope: "all" },
  ],
} satisfies AuthContext;

export const product = {
  id: PRODUCT_ID,
  code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  name: "年度品牌技术支持",
  amount_fen: 1,
  term_years: 1,
  purchase_notes: "支付成功后自动开通或续期一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  enabled: true,
  version: 2,
  updated_by_employee_id: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
} satisfies BrandingAddonProductRecord;

export const order = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  order_no: "BA202607280001",
  out_trade_no: "BA202607280001",
  idempotency_key: IDEMPOTENCY_KEY,
  product_id: PRODUCT_ID,
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  product_name: "年度品牌技术支持",
  amount_fen: 1,
  term_years: 1,
  purchase_notes: "支付成功后自动开通或续期一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  status: "pending",
  channel: "wechat_pay",
  payer_openid: "openid-from-login",
  payment_config_id: CONFIG_ID,
  expected_guard_version: 3,
  payment_mchid: "1900000001",
  payment_appid: "wx-platform-app",
  prepay_id: "prepay-1",
  payment_expires_at: "2026-07-28T02:05:00.000Z",
  transaction_id: null,
  paid_amount_fen: null,
  paid_at: null,
  closed_at: null,
  failure_code: null,
  failure_message: null,
  entitlement_event_id: null,
  created_by: EMPLOYEE_ID,
  metadata: { product_version: 2 },
  close_claim_token: null,
  close_claim_expires_at: null,
  close_attempt_count: 0,
  close_last_error: null,
  created_at: "2026-07-28T02:00:00.000Z",
  updated_at: "2026-07-28T02:00:00.000Z",
} satisfies BrandingAddonOrderRecord;

export const entitlement = {
  id: "99999999-9999-4999-8999-999999999999",
  tenant_id: TENANT_ID,
  entitlement_code: "custom_support_branding",
  status: "active",
  starts_at: "2026-07-28T02:01:00.000Z",
  expires_at: "2027-07-28T02:01:00.000Z",
  source_type: "purchase",
  source_id: ORDER_ID,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_by_employee_id: null,
  created_at: "2026-07-28T02:01:00.000Z",
  updated_at: "2026-07-28T02:01:00.000Z",
} satisfies TenantEntitlementRecord;

export const paymentConfig = {
  id: CONFIG_ID,
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://platform/wechat-pay",
  secret_bundle_revision: "bundle-revision-1",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: "2026-07-28T00:00:00.000Z",
  risk_switches: {},
  recharge_guard_version: 3,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

export function createDependencies(overrides: {
  product?: BrandingAddonProductRecord | null;
  order?: BrandingAddonOrderRecord | null;
  entitlement?: TenantEntitlementRecord | null;
} = {}) {
  const currentOrder = overrides.order === undefined ? order : overrides.order;
  const currentProduct = overrides.product === undefined
    ? product
    : overrides.product;
  const currentEntitlement = overrides.entitlement === undefined
    ? null
    : overrides.entitlement;

  const productRepository = {
    getProduct: mock(async () => currentProduct),
  };
  const orderRepository = {
    findByIdempotencyKey: mock(
      async (): Promise<BrandingAddonOrderRecord | null> => null,
    ),
    findPendingByTenantProduct: mock(
      async (): Promise<BrandingAddonOrderRecord | null> => null,
    ),
    createOrder: mock(async () => currentOrder ?? order),
    markPrepayCreated: mock(async () => currentOrder ?? order),
    markFailedBeforePrepay: mock(
      async (): Promise<BrandingAddonOrderRecord | null> =>
        currentOrder ?? order,
    ),
    findInternalTenantOrderById: mock(async () => currentOrder),
    findTenantOrderById: mock(async () => currentOrder),
    listTenantOrders: mock(async () => ({
      list: currentOrder ? [currentOrder] : [],
      pagination: { page: 1, pageSize: 20, total: currentOrder ? 1 : 0, totalPages: currentOrder ? 1 : 0 },
    })),
  };
  const entitlementRepository = {
    findByCode: mock(async () => currentEntitlement),
  };
  const paymentConfigRepository = {
    findWechatPayConfig: mock(async () => paymentConfig),
    findWechatPayConfigById: mock(async () => paymentConfig),
  };
  const accessPolicy = {
    assertTenantContext: mock((context: AuthContext) => {
      if (!context.tenantId) {
        throw Object.assign(new Error("缺少租户上下文"), {
          statusCode: 403,
          code: "TENANT_CONTEXT_REQUIRED",
        });
      }
      return context.tenantId;
    }),
    hasPermission: mock((context: AuthContext, permission: string) =>
      context.permissions.some(({ code }) => code === permission)
    ),
  };
  const secretBundleService = {
    load: mock(async () => ({
      privateKeyPem: "private-key",
      apiV3Key: "12345678901234567890123456789012",
      wechatPayPublicKeyId: null,
      wechatPayPublicKeyPem: null,
      baseUrl: "https://api.mch.weixin.qq.com",
      revision: "bundle-revision-1",
    })),
  };
  const wechatPayGateway = {
    createJsapiPrepay: mock(async () => ({
      prepayId: "prepay-1",
      paymentRequest: {
        timeStamp: "1785204000",
        nonceStr: "nonce",
        package: "prepay_id=prepay-1",
        signType: "RSA" as const,
        paySign: "pay-sign",
      },
    })),
    createMiniProgramPaymentRequest: mock(() => ({
      timeStamp: "1785204000",
      nonceStr: "nonce-resigned",
      package: "prepay_id=prepay-1",
      signType: "RSA" as const,
      paySign: "pay-sign-resigned",
    })),
  };

  return {
    productRepository,
    orderRepository,
    entitlementRepository,
    paymentConfigRepository,
    accessPolicy,
    secretBundleService,
    wechatPayGateway,
  };
}
