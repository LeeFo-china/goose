import { z } from "zod";

const uuid = z.uuid();
const dateTime = z.iso.datetime({ offset: true });
const positiveInteger = z.number().int().safe().positive();
const nonBlank = z.string().trim().min(1);
const nullableUuid = uuid.nullable();
const nullableDateTime = dateTime.nullable();

export const paymentStatusSchema = z.enum([
  "pending",
  "paid",
  "refund_reviewing",
  "refunding",
  "partially_refunded",
  "refunded",
  "closed",
]);

export const serviceStatusSchema = z.enum([
  "waiting_payment",
  "waiting_assignment",
  "configuring",
  "deploying",
  "training",
  "awaiting_acceptance",
  "rectifying",
  "accepted",
  "active",
  "canceled",
]);

export const workOrderStatusSchema = serviceStatusSchema.exclude([
  "waiting_payment",
]);

export const orderRpcSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  product_id: uuid,
  product_version_id: uuid,
  order_no: nonBlank,
  out_trade_no: nonBlank,
  idempotency_key: nullableUuid,
  product_code: nonBlank,
  pricing_version: positiveInteger,
  product_snapshot: z.record(z.string(), z.unknown()),
  term_years: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  amount_fen: positiveInteger,
  paid_amount_fen: positiveInteger.nullable(),
  payment_status: paymentStatusSchema,
  service_status: serviceStatusSchema,
  payment_config_id: uuid,
  payment_config_guard_version: positiveInteger,
  payer_openid: nonBlank,
  prepay_id: nonBlank.nullable(),
  transaction_id: nonBlank.nullable(),
  payment_expires_at: dateTime,
  paid_at: nullableDateTime,
  closed_at: nullableDateTime,
  terms_version: positiveInteger,
  terms_accepted_at: dateTime,
  created_by_employee_id: uuid,
  version: positiveInteger,
  created_at: dateTime,
  updated_at: dateTime,
  source_trial_id: nullableUuid,
  service_access_terminated_at: nullableDateTime,
  service_access_termination_reason: nonBlank.nullable(),
  service_access_terminated_by_employee_id: nullableUuid,
  cancel_idempotency_key: nullableUuid,
  cancel_claim_expires_at: nullableDateTime,
  close_reason: nonBlank.nullable(),
  closed_by_employee_id: nullableUuid,
}).passthrough();

export const workOrderRpcSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  service_order_id: uuid,
  order_no: nonBlank,
  status: workOrderStatusSchema,
  assignee_employee_id: nullableUuid,
  created_by_employee_id: nullableUuid,
  assigned_at: nullableDateTime,
  version: positiveInteger,
  created_at: dateTime,
  updated_at: dateTime,
}).passthrough();

export const acceptanceRpcSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  service_order_id: uuid,
  work_order_id: uuid,
  status: z.enum(["draft", "submitted", "accepted", "rejected", "cancelled"]),
  summary: nonBlank,
  prepared_by_employee_id: uuid,
  prepared_at: dateTime,
  submitted_at: nullableDateTime,
  acceptance_due_at: nullableDateTime,
  created_at: dateTime,
  updated_at: dateTime,
}).passthrough();

export const contractSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  service_family: z.literal("platform_technical_service"),
  status: z.enum(["active", "suspended", "expired", "canceled"]),
  service_start_at: dateTime,
  service_end_at: dateTime,
  last_period_id: nullableUuid,
  version: positiveInteger,
  created_at: dateTime,
  updated_at: dateTime,
}).passthrough().superRefine((value, context) => {
  if (Date.parse(value.service_end_at) <= Date.parse(value.service_start_at)) {
    context.addIssue({ code: "custom", message: "contract time invalid" });
  }
});

export const contractPeriodSchema = z.object({
  id: uuid,
  contract_id: uuid,
  tenant_id: uuid,
  service_order_id: uuid,
  accepted_at: dateTime,
  starts_at: dateTime,
  ends_at: dateTime,
  original_starts_at: dateTime,
  original_ends_at: dateTime,
  term_years: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: z.enum(["active", "adjusted", "voided"]),
  adjustment_reason: nonBlank.nullable(),
  refund_request_id: nullableUuid,
  metadata: z.record(z.string(), z.unknown()),
  version: positiveInteger,
  created_at: dateTime,
  updated_at: dateTime,
}).passthrough().superRefine((value, context) => {
  if (
    Date.parse(value.ends_at) <= Date.parse(value.starts_at) ||
    Date.parse(value.original_ends_at) <= Date.parse(value.original_starts_at)
  ) {
    context.addIssue({ code: "custom", message: "contract period time invalid" });
  }
  const isActive = value.status === "active";
  if (
    (isActive && (value.adjustment_reason !== null || value.refund_request_id !== null)) ||
    (!isActive && (!value.adjustment_reason || !value.refund_request_id))
  ) {
    context.addIssue({ code: "custom", message: "contract period audit invalid" });
  }
});

export const refundRequestSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  service_order_id: uuid,
  idempotency_key: uuid,
  reason: nonBlank,
  status: z.enum([
    "reviewing",
    "approved",
    "refunding",
    "refunded",
    "rejected",
    "cancelled",
  ]),
  version: positiveInteger,
  created_by_employee_id: uuid,
  reviewed_by_employee_id: nullableUuid,
  reviewed_at: nullableDateTime,
  review_remark: z.string().nullable(),
  out_refund_no: nonBlank.nullable(),
  wechat_refund_id: nonBlank.nullable(),
  refund_amount_fen: positiveInteger.nullable(),
  refunded_at: nullableDateTime,
  refunded_by_employee_id: nullableUuid,
  provider_refund_status: z.literal("CLOSED").nullable(),
  provider_out_refund_no: nonBlank.nullable(),
  provider_wechat_refund_id: nonBlank.nullable(),
  provider_refund_amount_fen: positiveInteger.nullable(),
  provider_checked_at: nullableDateTime,
  provider_checked_by_employee_id: nullableUuid,
  created_at: dateTime,
  updated_at: dateTime,
}).passthrough().superRefine((value, context) => {
  const successFacts = [
    value.out_refund_no,
    value.wechat_refund_id,
    value.refund_amount_fen,
    value.refunded_at,
    value.refunded_by_employee_id,
  ];
  const closedFacts = [
    value.provider_refund_status,
    value.provider_out_refund_no,
    value.provider_wechat_refund_id,
    value.provider_refund_amount_fen,
    value.provider_checked_at,
    value.provider_checked_by_employee_id,
  ];
  const hasAllSuccess = successFacts.every((fact) => fact !== null);
  const hasNoSuccess = successFacts.every((fact) => fact === null);
  const hasAllClosed = closedFacts.every((fact) => fact !== null);
  const hasNoClosed = closedFacts.every((fact) => fact === null);
  if (
    (value.status === "refunded" && (!hasAllSuccess || !hasNoClosed)) ||
    (value.status !== "refunded" && !hasNoSuccess) ||
    (hasAllClosed && value.status !== "cancelled") ||
    (!hasAllClosed && !hasNoClosed)
  ) {
    context.addIssue({ code: "custom", message: "refund execution facts invalid" });
  }
});

export const trustedRefundOrderSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  order_no: nonBlank,
  out_trade_no: nonBlank,
  amount_fen: positiveInteger,
  paid_amount_fen: positiveInteger,
  payment_status: paymentStatusSchema,
  service_status: serviceStatusSchema,
  payment_config_id: uuid,
  payment_config_guard_version: positiveInteger,
  transaction_id: nonBlank,
}).passthrough();

function addIssue(context: z.RefinementCtx, message: string) {
  context.addIssue({ code: "custom", message });
}

function factsAreBound(value: {
  order: z.infer<typeof orderRpcSchema>;
  work_order: z.infer<typeof workOrderRpcSchema>;
}) {
  return value.order.tenant_id === value.work_order.tenant_id &&
    value.order.id === value.work_order.service_order_id;
}

export const paymentConfirmationSchema = z.object({
  order: orderRpcSchema,
  work_order: workOrderRpcSchema,
  access_mode: z.literal("paid_onboarding").nullable(),
  idempotent: z.boolean(),
  error_code: z.null().optional().default(null),
}).passthrough().superRefine((value, context) => {
  if (!factsAreBound(value)) addIssue(context, "payment work order binding invalid");
  if (
    value.order.paid_amount_fen !== value.order.amount_fen ||
    !value.order.paid_at ||
    !value.order.transaction_id
  ) addIssue(context, "payment facts invalid");

  if (!value.idempotent) {
    if (
      value.order.payment_status !== "paid" ||
      value.order.service_status !== "waiting_assignment" ||
      value.order.service_access_terminated_at !== null ||
      value.work_order.status !== "waiting_assignment" ||
      value.access_mode !== "paid_onboarding"
    ) addIssue(context, "first payment state invalid");
    return;
  }

  if (![
    "paid",
    "refund_reviewing",
    "refunding",
    "partially_refunded",
    "refunded",
  ].includes(value.order.payment_status)) addIssue(context, "payment replay state invalid");
  const hasPaidOnboardingAccess = value.order.service_access_terminated_at === null &&
    !["accepted", "active"].includes(value.order.service_status);
  if (
    value.access_mode !== (hasPaidOnboardingAccess ? "paid_onboarding" : null)
  ) addIssue(context, "payment access mode invalid");
});

const tenantAcceptanceErrorCodeSchema = z.enum([
  "SERVICE_ACCEPTANCE_INVALID_STATE",
  "SERVICE_WORK_ORDER_VERSION_CONFLICT",
]);
const overdueAcceptanceErrorCodeSchema = z.enum([
  "SERVICE_ACCEPTANCE_INVALID_STATE",
  "SERVICE_WORK_ORDER_VERSION_CONFLICT",
  "SERVICE_ACCEPTANCE_NOT_OVERDUE",
]);

function acceptanceResultSchema(
  allowRejected: boolean,
  errorCodeSchema: typeof tenantAcceptanceErrorCodeSchema |
    typeof overdueAcceptanceErrorCodeSchema,
) {
  return z.object({
    order: orderRpcSchema.nullable(),
    work_order: workOrderRpcSchema.nullable(),
    acceptance_preparation: acceptanceRpcSchema.nullable(),
    contract: contractSchema.nullable(),
    contract_period: contractPeriodSchema.nullable(),
    idempotent: z.boolean(),
    error_code: errorCodeSchema.nullable(),
  }).passthrough().superRefine((value, context) => {
    if (value.error_code !== null) {
      if (
        value.order !== null || value.work_order !== null ||
        value.acceptance_preparation !== null || value.contract !== null ||
        value.contract_period !== null || value.idempotent
      ) addIssue(context, "acceptance error facts invalid");
      return;
    }
    if (!value.order || !value.work_order || !value.acceptance_preparation) {
      addIssue(context, "acceptance success facts missing");
      return;
    }
    if (
      !factsAreBound({ order: value.order, work_order: value.work_order }) ||
      value.acceptance_preparation.tenant_id !== value.order.tenant_id ||
      value.acceptance_preparation.service_order_id !== value.order.id ||
      value.acceptance_preparation.work_order_id !== value.work_order.id
    ) addIssue(context, "acceptance binding invalid");

    const isAccepted = ["accepted", "active"].includes(value.order.service_status);
    const isRejected = value.order.service_status === "rectifying";
    if (isAccepted) {
      if (
        value.work_order.status !== value.order.service_status ||
        value.acceptance_preparation.status !== "accepted" ||
        value.order.payment_status === "refunded" ||
        value.order.service_access_terminated_at !== null ||
        !value.contract || !value.contract_period ||
        value.contract.tenant_id !== value.order.tenant_id ||
        value.contract_period.tenant_id !== value.order.tenant_id ||
        value.contract_period.service_order_id !== value.order.id ||
        value.contract_period.contract_id !== value.contract.id ||
        !["active", "adjusted"].includes(value.contract_period.status)
      ) addIssue(context, "accepted facts invalid");
      return;
    }
    if (
      !allowRejected || !isRejected || value.work_order.status !== "rectifying" ||
      value.acceptance_preparation.status !== "rejected" ||
      value.contract !== null || value.contract_period !== null || value.idempotent
    ) addIssue(context, "rejected facts invalid");
  });
}

export const tenantAcceptanceResultSchema = acceptanceResultSchema(
  true,
  tenantAcceptanceErrorCodeSchema,
);
export const overdueAcceptanceResultSchema = acceptanceResultSchema(
  false,
  overdueAcceptanceErrorCodeSchema,
);

export const trustedRefundExecutionSchema = refundRequestSchema.extend({
  order: trustedRefundOrderSchema,
}).superRefine((value, context) => {
  if (
    value.order.tenant_id !== value.tenant_id ||
    value.order.id !== value.service_order_id
  ) addIssue(context, "refund order binding mismatch");
});

export const refundConfirmationSchema = z.object({
  refund_request: refundRequestSchema,
  order: orderRpcSchema,
  contract: contractSchema.nullable(),
  contract_period: contractPeriodSchema.nullable(),
  idempotent: z.boolean(),
  error_code: z.null(),
}).passthrough().superRefine((value, context) => {
  if (
    value.refund_request.status !== "refunded" ||
    value.refund_request.tenant_id !== value.order.tenant_id ||
    value.refund_request.service_order_id !== value.order.id ||
    value.order.payment_status !== "refunded" ||
    value.order.service_status !== "canceled" ||
    !value.order.service_access_terminated_at ||
    value.order.service_access_termination_reason !== "full_refund_confirmed" ||
    value.refund_request.refund_amount_fen !== value.order.amount_fen ||
    value.order.paid_amount_fen !== value.order.amount_fen ||
    value.refund_request.refunded_at !== value.order.service_access_terminated_at ||
    value.refund_request.refunded_by_employee_id !==
      value.order.service_access_terminated_by_employee_id
  ) addIssue(context, "refund confirmation facts invalid");
  const hasContract = value.contract !== null;
  if (hasContract !== (value.contract_period !== null)) {
    addIssue(context, "refund contract pair invalid");
  } else if (value.contract && value.contract_period && (
    value.contract.tenant_id !== value.order.tenant_id ||
    value.contract_period.contract_id !== value.contract.id ||
    value.contract_period.tenant_id !== value.order.tenant_id ||
    value.contract_period.service_order_id !== value.order.id ||
    value.contract_period.status !== "voided" ||
    value.contract_period.refund_request_id !== value.refund_request.id
  )) addIssue(context, "refund period binding invalid");
});

export const refundClosureSchema = z.object({
  refund_request: refundRequestSchema,
  order: orderRpcSchema,
  provider_status: z.literal("CLOSED"),
  refunded: z.literal(false),
  access_terminated: z.literal(false),
  retryable: z.literal(false),
  idempotent: z.boolean(),
  error_code: z.null(),
}).passthrough().superRefine((value, context) => {
  if (
    value.refund_request.status !== "cancelled" ||
    value.refund_request.provider_refund_status !== "CLOSED" ||
    value.refund_request.tenant_id !== value.order.tenant_id ||
    value.refund_request.service_order_id !== value.order.id ||
    value.order.payment_status !== "paid" ||
    value.order.service_access_terminated_at !== null ||
    value.refund_request.provider_refund_amount_fen !== value.order.amount_fen ||
    value.order.paid_amount_fen !== value.order.amount_fen
  ) addIssue(context, "refund closure facts invalid");
});
