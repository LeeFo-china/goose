import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformRechargeRefundRequestRecord } from "@/repositories/platform-billing-recharge-refunds";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

export const order = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TC202607020001",
  idempotency_key: "idem-1",
  package_code: "credit_1000",
  credits: 1000,
  amount_fen: 10000,
  bonus_credits: 100,
  channel: "wechat_pay",
  status: "paid",
  paid_at: "2026-07-02T08:03:00.000Z",
  created_by: "employee-1",
  remark: null,
  metadata: {},
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607020001",
  prepay_id: null,
  transaction_id: "4200000001",
  paid_amount_fen: 10000,
  closed_at: null,
  latest_notification_id: null,
  refund_status: "approved",
  refund_requested_at: "2026-07-10T08:00:00.000Z",
  refunded_at: null,
  refund_amount_fen: null,
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-10T08:00:00.000Z",
} satisfies TenantCreditOrderRecord;

export const approvedRequest = {
  id: "refund-request-1",
  tenant_id: "tenant-1",
  order_id: "order-1",
  request_no: "TRR202607100800000001",
  idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
  status: "approved",
  reason: "客户误充值，需要申请退款",
  requested_amount_fen: 10000,
  requested_credits: 1100,
  requested_by_employee_id: "employee-1",
  reviewed_by_employee_id: "employee-platform",
  reviewed_at: "2026-07-15T10:00:00.000Z",
  review_note: "同意退款，进入退款执行",
  out_refund_no: null,
  wechat_refund_id: null,
  refund_amount_fen: null,
  refunded_at: null,
  failure_message: null,
  metadata: {},
  created_at: "2026-07-10T08:00:00.000Z",
  updated_at: "2026-07-15T10:00:00.000Z",
  order,
  tenant: { id: "tenant-1", name: "固始晴天装饰", slug: "qingtian" },
} satisfies PlatformRechargeRefundRequestRecord;

export const refundingRequest = {
  ...approvedRequest,
  status: "refunding",
  out_refund_no: "TRR202607100800000001",
} satisfies PlatformRechargeRefundRequestRecord;

export const requestWithWechatResult = {
  ...refundingRequest,
  wechat_refund_id: "5030000000202607150000000001",
  refund_amount_fen: 10000,
  metadata: {
    wechat_refund_response: {
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      status: "PROCESSING",
    },
  },
} satisfies PlatformRechargeRefundRequestRecord;

export const failedRequest = {
  ...refundingRequest,
  status: "failed",
  failure_message: "微信退款请求失败",
} satisfies PlatformRechargeRefundRequestRecord;

export const paymentConfig = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台微信支付",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wxbac3b1e168fd968a",
  sub_app_id: null,
  encrypted_config_ref: "env://WECHAT_PAY_TEST",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

export const authContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
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
  permissions: [
    { code: "platform.billing.recharge_refund.read", scope: "all" },
    { code: "platform.billing.recharge_refund.review", scope: "all" },
  ],
} satisfies AuthContext;
