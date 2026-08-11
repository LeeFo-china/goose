export const RPC_IDS = {
  tenant: "00000000-0000-4000-8000-000000000011",
  employee: "00000000-0000-4000-8000-000000000012",
  order: "00000000-0000-4000-8000-000000000013",
  product: "00000000-0000-4000-8000-000000000014",
  productVersion: "00000000-0000-4000-8000-000000000015",
  paymentConfig: "00000000-0000-4000-8000-000000000016",
  workOrder: "00000000-0000-4000-8000-000000000017",
  acceptance: "00000000-0000-4000-8000-000000000018",
  contract: "00000000-0000-4000-8000-000000000019",
  period: "00000000-0000-4000-8000-000000000020",
  refund: "00000000-0000-4000-8000-000000000021",
  idempotency: "00000000-0000-4000-8000-000000000022",
} as const;

const createdAt = "2026-08-10T10:00:00.000Z";
const updatedAt = "2026-08-10T10:30:00.000Z";

export function rpcOrder(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: RPC_IDS.order,
    tenant_id: RPC_IDS.tenant,
    product_id: RPC_IDS.product,
    product_version_id: RPC_IDS.productVersion,
    order_no: "TSO202608100001",
    out_trade_no: "TSO202608100001",
    idempotency_key: RPC_IDS.idempotency,
    product_code: "platform_service_1y",
    pricing_version: 1,
    product_snapshot: {},
    term_years: 1,
    amount_fen: 100,
    paid_amount_fen: 100,
    payment_status: "paid",
    service_status: "waiting_assignment",
    payment_config_id: RPC_IDS.paymentConfig,
    payment_config_guard_version: 7,
    payer_openid: "openid-platform-service",
    prepay_id: "prepay-platform-service",
    transaction_id: "4200000000202608100000000001",
    payment_expires_at: "2026-08-10T10:05:00.000Z",
    paid_at: "2026-08-10T10:01:00.000Z",
    closed_at: null,
    terms_version: 1,
    terms_accepted_at: createdAt,
    created_by_employee_id: RPC_IDS.employee,
    version: 2,
    created_at: createdAt,
    updated_at: updatedAt,
    source_trial_id: null,
    service_access_terminated_at: null,
    service_access_termination_reason: null,
    service_access_terminated_by_employee_id: null,
    cancel_idempotency_key: null,
    cancel_claim_expires_at: null,
    close_reason: null,
    closed_by_employee_id: null,
    ...patch,
  };
}

export function rpcWorkOrder(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: RPC_IDS.workOrder,
    tenant_id: RPC_IDS.tenant,
    service_order_id: RPC_IDS.order,
    order_no: "TSO202608100001",
    status: "waiting_assignment",
    assignee_employee_id: null,
    created_by_employee_id: RPC_IDS.employee,
    assigned_at: null,
    version: 2,
    created_at: createdAt,
    updated_at: updatedAt,
    ...patch,
  };
}

export function rpcAcceptance(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: RPC_IDS.acceptance,
    tenant_id: RPC_IDS.tenant,
    service_order_id: RPC_IDS.order,
    work_order_id: RPC_IDS.workOrder,
    status: "accepted",
    summary: "平台技术服务验收",
    prepared_by_employee_id: RPC_IDS.employee,
    prepared_at: createdAt,
    submitted_at: "2026-08-10T10:10:00.000Z",
    acceptance_due_at: "2026-08-11T10:10:00.000Z",
    created_at: createdAt,
    updated_at: updatedAt,
    ...patch,
  };
}

export function rpcContract(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: RPC_IDS.contract,
    tenant_id: RPC_IDS.tenant,
    service_family: "platform_technical_service",
    status: "active",
    service_start_at: "2026-08-10T10:30:00.000Z",
    service_end_at: "2027-08-10T10:30:00.000Z",
    last_period_id: RPC_IDS.period,
    version: 1,
    created_at: updatedAt,
    updated_at: updatedAt,
    ...patch,
  };
}

export function rpcPeriod(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: RPC_IDS.period,
    contract_id: RPC_IDS.contract,
    tenant_id: RPC_IDS.tenant,
    service_order_id: RPC_IDS.order,
    accepted_at: updatedAt,
    starts_at: updatedAt,
    ends_at: "2027-08-10T10:30:00.000Z",
    original_starts_at: updatedAt,
    original_ends_at: "2027-08-10T10:30:00.000Z",
    term_years: 1,
    status: "active",
    adjustment_reason: null,
    refund_request_id: null,
    metadata: {},
    version: 1,
    created_at: updatedAt,
    updated_at: updatedAt,
    ...patch,
  };
}

export function rpcRefundRequest(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: RPC_IDS.refund,
    tenant_id: RPC_IDS.tenant,
    service_order_id: RPC_IDS.order,
    idempotency_key: RPC_IDS.idempotency,
    reason: "不再需要平台技术服务",
    status: "refunded",
    version: 3,
    created_by_employee_id: RPC_IDS.employee,
    reviewed_by_employee_id: RPC_IDS.employee,
    reviewed_at: "2026-08-10T10:20:00.000Z",
    review_remark: "同意全额退款",
    out_refund_no: "TSRF00000000000040008000000000000021",
    wechat_refund_id: "5030000000202608100000000001",
    refund_amount_fen: 100,
    refunded_at: updatedAt,
    refunded_by_employee_id: RPC_IDS.employee,
    provider_refund_status: null,
    provider_out_refund_no: null,
    provider_wechat_refund_id: null,
    provider_refund_amount_fen: null,
    provider_checked_at: null,
    provider_checked_by_employee_id: null,
    created_at: createdAt,
    updated_at: updatedAt,
    ...patch,
  };
}

export function acceptedRpcEnvelope(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    order: rpcOrder({ service_status: "accepted" }),
    work_order: rpcWorkOrder({ status: "accepted" }),
    acceptance_preparation: rpcAcceptance(),
    contract: rpcContract(),
    contract_period: rpcPeriod(),
    idempotent: false,
    error_code: null,
    ...patch,
  };
}
