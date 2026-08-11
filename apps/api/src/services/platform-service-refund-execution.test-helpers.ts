import { mock } from "bun:test";

import type {
  RefundClosureResult,
  RefundExecutionRequestRecord,
} from "@/repositories/platform-service-rpc-results";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

export const refundId = "00000000-0000-4000-8000-000000000701";
export const orderId = "00000000-0000-4000-8000-000000000301";
export const configId = "00000000-0000-4000-8000-000000000201";
export const employeeId = "00000000-0000-4000-8000-000000000101";
export const outTradeNo = "TSO202608100001";
export const transactionId = "4200000000202608100000000001";
export const outRefundNo = `TSRF${refundId.replaceAll("-", "").toUpperCase()}`;

export const authContext = {
  authUserId: "platform-user",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  employeeId,
  isPlatformAdmin: false,
  isPlatformStaff: true,
  employeeName: "退款专员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["refund_operator"],
  roles: [],
  permissions: [{ code: "platform.service_refund.review", scope: "all" }],
} satisfies AuthContext;

export const order = {
  id: orderId,
  tenant_id: "00000000-0000-4000-8000-000000000011",
  order_no: outTradeNo,
  out_trade_no: outTradeNo,
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  paid_amount_fen: 980000,
  payment_status: "refund_reviewing",
  service_status: "awaiting_acceptance",
  payment_config_id: configId,
  payment_config_guard_version: 7,
  transaction_id: transactionId,
  service_access_terminated_at: null,
  service_access_termination_reason: null,
  service_access_terminated_by_employee_id: null,
  prepay_id: "prepay-1",
  payment_expires_at: "2026-08-10T10:05:00.000Z",
  paid_at: "2026-08-10T10:01:00.000Z",
  closed_at: null,
  terms_version: 1,
  version: 4,
  created_at: "2026-08-10T10:00:00.000Z",
  updated_at: "2026-08-10T10:10:00.000Z",
};

export const refundRequest: RefundExecutionRequestRecord = {
  id: refundId,
  tenant_id: order.tenant_id,
  service_order_id: orderId,
  idempotency_key: "00000000-0000-4000-8000-000000000801",
  reason: "不再需要平台技术服务",
  status: "approved",
  version: 2,
  created_by_employee_id: "00000000-0000-4000-8000-000000000102",
  reviewed_by_employee_id: employeeId,
  reviewed_at: "2026-08-10T10:20:00.000Z",
  review_remark: "同意全额退款",
  out_refund_no: null,
  wechat_refund_id: null,
  refund_amount_fen: null,
  refunded_at: null,
  refunded_by_employee_id: null,
  created_at: "2026-08-10T10:15:00.000Z",
  updated_at: "2026-08-10T10:20:00.000Z",
  order,
};

export const config = {
  id: configId,
  provider: "wechat_pay" as const,
  profile_code: "platform_direct_recharge" as const,
  principal_type: "platform" as const,
  merchant_mode: "direct_merchant" as const,
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform",
  sub_app_id: null,
  encrypted_config_ref: "secret://wechat-pay",
  secret_bundle_revision: "revision-7",
  serial_no: "SERIAL-1",
  notify_url: "https://example.com/callback",
  enabled_channels: ["platform_service"],
  status: "active" as const,
  validation_status: "valid" as const,
  last_validated_at: "2026-08-10T09:00:00.000Z",
  risk_switches: {},
  recharge_guard_version: 7,
  created_by_employee_id: employeeId,
  updated_by_employee_id: employeeId,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-10T09:00:00.000Z",
};

export const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID",
  wechatPayPublicKeyPem: "public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "revision-7",
};

export function transactionResponse() {
  return {
    appid: "wx-platform",
    mchid: "1900000001",
    out_trade_no: outTradeNo,
    transaction_id: transactionId,
    trade_state: "SUCCESS",
    success_time: "2026-08-10T10:01:00+08:00",
    amount: { total: 980000, currency: "CNY" },
    requestId: "transaction-request-id",
  };
}

export function refundResponse(
  status: "SUCCESS" | "PROCESSING" | "ABNORMAL" | "CLOSED",
) {
  return {
    out_refund_no: outRefundNo,
    refund_id: "5030000000202608100000000001",
    transaction_id: transactionId,
    out_trade_no: outTradeNo,
    status,
    success_time: status === "SUCCESS" ? "2026-08-10T10:30:00+08:00" : undefined,
    amount: { refund: 980000, total: 980000, currency: "CNY" },
    requestId: "refund-request-id",
  };
}

export function createHarness() {
  const repository = {
    findPlatformServiceRefundRequestById: mock(async () => refundRequest),
    confirmServiceRefund: mock(async () => ({
      refundRequest: { ...refundRequest, status: "refunded" },
      order: { ...order, payment_status: "refunded" },
      contract: null,
      contractPeriod: null,
      idempotent: false,
    })),
    closeServiceRefund: mock(async (): Promise<RefundClosureResult> => ({
      refundRequest: {
        ...refundRequest,
        status: "cancelled",
        provider_refund_status: "CLOSED",
        provider_out_refund_no: outRefundNo,
        provider_wechat_refund_id: "5030000000202608100000000001",
        provider_refund_amount_fen: 980000,
        provider_checked_at: "2026-08-10T10:31:00.000Z",
        provider_checked_by_employee_id: employeeId,
      },
      order: { ...order, payment_status: "paid" },
      providerStatus: "CLOSED",
      refunded: false,
      accessTerminated: false,
      retryable: false,
      idempotent: false,
    })),
  };
  const gateway = {
    queryTransactionByOutTradeNo: mock(async () => transactionResponse()),
    requestRefund: mock(async (_input?: unknown) => refundResponse("SUCCESS")),
    queryRefundByOutRefundNo: mock(async () => refundResponse("SUCCESS")),
  };
  return {
    repository,
    paymentConfigRepository: {
      findWechatPayConfigById: mock(async () => config),
    },
    secretBundleService: { load: mock(async () => secretBundle) },
    gateway,
    nowFactory: () => new Date("2026-08-10T10:31:00.000Z"),
  };
}

export async function createService(harness: ReturnType<typeof createHarness>) {
  const { PlatformServiceRefundExecutionService } = await import(
    "./platform-service-refund-execution"
  );
  return new PlatformServiceRefundExecutionService({
    repository: harness.repository,
    paymentConfigRepository: harness.paymentConfigRepository,
    secretBundleService: harness.secretBundleService,
    wechatPayGateway: harness.gateway,
    nowFactory: harness.nowFactory,
  });
}
