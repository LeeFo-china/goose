import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { EffectiveProductRecord, OrderRecord, ProductRecord } from "@/repositories/platform-service-order-records";
import type { AuthContext } from "@/services/authorization";
import type { WechatPayMiniProgramPaymentRequest } from "@/services/wechat-pay-signatures";

export const tenantId = "00000000-0000-4000-8000-000000000011";
export const employeeId = "00000000-0000-4000-8000-000000000012";
export const orderId = "00000000-0000-4000-8000-000000000301";
export const productId = "00000000-0000-4000-8000-000000000101";
export const productVersionId = "00000000-0000-4000-8000-000000000201";
export const configId = "00000000-0000-4000-8000-000000000401";
export const sourceTrialId = "00000000-0000-4000-8000-000000000501";
export const now = new Date("2026-08-03T12:00:00.000Z");
export const tenantAuth = {
  authUserId: "auth-tenant",
  employeeId,
  tenantId,
  tenantName: "装企",
  tenantSlug: "tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "采购员",
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
    { code: "billing.service_order.create", scope: "all" },
    { code: "billing.service_order.read", scope: "all" },
    { code: "billing.service_order.refund.request", scope: "all" },
  ],
} satisfies AuthContext;

export const product = {
  id: productId,
  code: "platform_service_1y",
  status: "enabled",
  published_version_id: productVersionId,
  published_version: {
    id: productVersionId,
    version: 1,
    title: "平台部署及年度技术服务（1年）",
    term_years: 1,
    list_amount_fen: 980000,
    amount_fen: 980000,
    service_scope: ["部署", "培训"],
    terms_version: 1,
    terms_content: "服务条款",
  },
} satisfies ProductRecord;

export const order = {
  id: orderId,
  tenant_id: tenantId,
  order_no: "TSO202608030001",
  out_trade_no: "TSO202608030001",
  product_code: "platform_service_1y",
  product_snapshot: {
    product_id: productId, product_version_id: productVersionId,
    code: product.code, ...product.published_version, pricing_version: 3,
  },
  term_years: 1,
  amount_fen: 980000,
  payment_status: "pending",
  service_status: "waiting_payment",
  payment_config_id: configId,
  payment_config_guard_version: 7,
  payer_openid: "openid-user",
  prepay_id: "prepay-existing",
  payment_expires_at: "2026-08-03T12:05:00.000Z",
  paid_at: null,
  closed_at: null,
  terms_version: 1,
  version: 1,
  created_at: "2026-08-03T12:00:00.000Z",
  updated_at: "2026-08-03T12:00:00.000Z",
} satisfies OrderRecord;

export const refundRequest = {
  id: "refund-1",
  tenant_id: tenantId,
  service_order_id: orderId,
  idempotency_key: "00000000-0000-4000-8000-000000000911",
  reason: "暂不需要服务",
  status: "reviewing",
  created_by_employee_id: employeeId,
  created_at: "2026-08-03T12:01:00.000Z",
  updated_at: "2026-08-03T12:01:00.000Z",
};

export const paymentConfig = {
  id: configId,
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform",
  sub_app_id: null,
  encrypted_config_ref: "secret://wechat",
  secret_bundle_revision: "secret-rev-1",
  serial_no: "SERIAL",
  notify_url: "https://api.example.com/wechat/pay/callback",
  enabled_channels: ["platform_service"],
  status: "active",
  validation_status: "valid",
  recharge_guard_version: 7,
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-08-03T00:00:00.000Z",
  updated_at: "2026-08-03T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

export const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "secret-rev-1",
};

export const newPaymentRequest = {
  timeStamp: "1",
  nonceStr: "nonce-new",
  package: "prepay_id=prepay-new",
  signType: "RSA",
  paySign: "sign-new",
} satisfies WechatPayMiniProgramPaymentRequest;

export const existingPaymentRequest = {
  timeStamp: "1",
  nonceStr: "nonce-existing",
  package: "prepay_id=prepay-existing",
  signType: "RSA",
  paySign: "sign-existing",
} satisfies WechatPayMiniProgramPaymentRequest;

export const effectiveProduct: EffectiveProductRecord = {
  product_id: productId, product_version_id: productVersionId,
  code: product.code, ...product.published_version, id: productId,
  pricing_version: 1, base_amount_fen: 980000, effective_amount_fen: 980000,
  base_price_rate_basis_points: 10000 as const, price_rate_basis_points: 10000,
  promotion: null,
};
export const promotion = {
  id: orderId, version_id: sourceTrialId, version: 2, name: "活动", badge_text: "限时2折",
  title: "活动标题", summary: "摘要", rules_text: "规则", discount_rate_basis_points: 2000,
  starts_at: "2026-08-01T00:00:00Z", ends_at: "2026-08-02T00:00:00Z",
  base_amount_fen: 980000, effective_amount_fen: 196000,
};


export function effectiveProductPage() {
  return {
    list: [{
      id: "00000000-0000-4000-8000-000000000014", product_id: "00000000-0000-4000-8000-000000000014", product_version_id: "00000000-0000-4000-8000-000000000014",
      code: "platform_service_1y", title: "年度服务", term_years: 1, pricing_version: 1,
      list_amount_fen: 980000, base_amount_fen: 980000, amount_fen: 196000,
      effective_amount_fen: 196000, base_price_rate_basis_points: 10000 as const,
      price_rate_basis_points: 2000, service_scope: ["部署"], terms_version: 1,
      terms_content: "条款", promotion: {
        id: "00000000-0000-4000-8000-000000000014", version_id: "00000000-0000-4000-8000-000000000014", version: 1, name: "限时活动",
        badge_text: "限时2折", title: "标题", summary: "摘要", rules_text: "规则",
        discount_rate_basis_points: 2000, starts_at: "2026-08-01T00:00:00+00:00",
        ends_at: "2026-08-02T00:00:00+00:00", base_amount_fen: 980000,
        effective_amount_fen: 196000,
      },
    }],
    pagination: { page: 2, pageSize: 100, total: 101, totalPages: 2 },
    server_time: "2026-08-01T00:00:00+00:00",
  };
}
