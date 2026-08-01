import type {
  SupplierPaymentAllocationInput,
  SupplierPaymentConfirmInput,
  SupplierPaymentMethod,
  SupplierPaymentRequestDetail,
} from "./payment-request-types";
import { decimalFromCents, moneyCents } from "./payment-request-page-utils";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BuildPaymentPayloadInput = {
  request: SupplierPaymentRequestDetail;
  allocations: SupplierPaymentAllocationInput[];
  paymentAmount?: string;
  paymentId?: string;
  paymentMethod: SupplierPaymentMethod;
  paymentReference: string;
  paidAt: string;
  evidenceImages: string[];
  remark: string | null;
};

export function toLocalDateTimeInput(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function toPaymentIsoDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildPaymentPayload(
  input: BuildPaymentPayloadInput,
): SupplierPaymentConfirmInput {
  if (input.request.allocations.some(
    ({ invoice_required_before_payment }) => invoice_required_before_payment,
  )) {
    throw new RangeError("该付款申请存在付款前发票门禁，暂不能付款");
  }
  if (input.allocations.length < 1 || input.allocations.length > 100) {
    throw new RangeError("付款分配必须为 1 至 100 行");
  }
  const ids = input.allocations.map(({ payment_request_allocation_id }) =>
    payment_request_allocation_id.toLowerCase()
  );
  if (new Set(ids).size !== ids.length) {
    throw new RangeError("付款分配不能重复");
  }
  const facts = new Map(input.request.allocations.map((allocation) => [
    allocation.id.toLowerCase(),
    allocation,
  ]));
  let total = BigInt(0);
  for (const allocation of input.allocations) {
    const fact = facts.get(allocation.payment_request_allocation_id.toLowerCase());
    if (!fact || fact.payable_event_id !== allocation.payable_event_id) {
      throw new RangeError("付款分配与申请事实不一致");
    }
    const amount = moneyCents(allocation.amount);
    const remaining = moneyCents(fact.requested_amount) -
      moneyCents(fact.paid_amount);
    if (amount <= BigInt(0) || amount > remaining) {
      throw new RangeError("每行付款金额不得超过申请剩余金额");
    }
    total += amount;
  }
  const paymentAmount = input.paymentAmount ?? decimalFromCents(total);
  if (moneyCents(paymentAmount) !== total) {
    throw new RangeError("付款分配合计必须等于本次付款金额");
  }
  if (input.evidenceImages.length < 1 || input.evidenceImages.length > 9) {
    throw new RangeError("付款凭证必须为 1 至 9 张");
  }
  const evidenceImages = input.evidenceImages.map((image) => image.trim());
  if (evidenceImages.some((image) => !image)) {
    throw new RangeError("付款凭证不能为空");
  }
  const remark = input.remark?.trim() || null;
  if (input.paymentMethod === "other" && !remark) {
    throw new RangeError("其他付款方式必须填写备注");
  }
  const paymentReference = input.paymentReference.trim();
  if (!paymentReference || paymentReference.length > 200) {
    throw new RangeError("付款流水号不能为空且不能超过 200 个字符");
  }
  if (Number.isNaN(Date.parse(input.paidAt))) {
    throw new RangeError("付款时间无效");
  }
  const paymentId = input.paymentId ?? crypto.randomUUID();
  if (!UUID_PATTERN.test(paymentId)) {
    throw new RangeError("付款 ID 无效");
  }
  return {
    id: paymentId.toLowerCase(),
    expected_version: input.request.payment_request.version,
    payment_method: input.paymentMethod,
    payment_reference: paymentReference,
    paid_at: input.paidAt,
    evidence_images: evidenceImages,
    remark,
    allocations: input.allocations.map((allocation) => ({ ...allocation })),
  };
}
