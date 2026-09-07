import { z } from "zod";
import { ADMIN_SESSION_STORAGE_PREFIX } from "@/components/layout/admin-session-scope";
import { resolveSupplierCommandAttempt } from "@/components/supplier-products/supplier-command-attempt";
import { beginFrozenCommand, markFrozenCommandUncertain, type FrozenCommand } from "@/components/supplier-purchase-orders/purchase-order-fulfillment-ui-state";
import type { PayableDestination, PayableDestinationFields } from "../supplier-payables/payable-destination";
import * as api from "./payment-request-api";
import { errorCode, errorMessage, errorStatus } from "./payment-request-page-utils";
import { freezeFinancialDestination, parsePaymentRequestReceipt } from "./payment-request-receipt";
import type { SupplierPaymentConfirmInput, SupplierPaymentRequestUpdateDraftInput } from "./payment-request-types";

export type PaymentRequestCommandKind = "create" | "update" | "submit" | "approve" | "reject" | "cancel" | "close" | "pay";
export type PaymentRequestCommandPayload = SupplierPaymentRequestUpdateDraftInput | SupplierPaymentConfirmInput |
  { expected_version: number; reason?: string; remark?: string | null };
export type PaymentRequestCommandFacts = PayableDestinationFields & {
  requested_amount?: string;
  paid_amount?: string;
  request_no?: string;
};
const amountBaselineSchema = z.object({
  requested_amount: z.string().regex(/^(?:0|[1-9]\d{0,15})\.\d{2}$/),
  paid_amount: z.string().regex(/^(?:0|[1-9]\d{0,15})\.\d{2}$/),
});
function freezeAmounts(value: unknown) {
  const parsed = amountBaselineSchema.safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : null;
}
export type PendingPaymentRequestCommand = {
  kind: PaymentRequestCommandKind;
  destination: Readonly<PayableDestination>;
  amounts: Readonly<z.infer<typeof amountBaselineSchema>> | null;
  requestNo?: string;
  command: FrozenCommand<PaymentRequestCommandPayload>;
};

export function createPaymentRequestCommand(kind: PaymentRequestCommandKind, id: string, payload: PaymentRequestCommandPayload, destination: PaymentRequestCommandFacts): PendingPaymentRequestCommand {
  const attempt = resolveSupplierCommandAttempt(null, {
    scope: `payment-request:${kind}`, resourcePath: id, payload, keyFormat: "uuid",
  });
  return { kind, destination: freezeFinancialDestination(destination), amounts: freezeAmounts(destination),
    requestNo: destination.request_no, command: beginFrozenCommand(attempt, payload, id) };
}

export async function sendPaymentRequestCommand(pending: PendingPaymentRequestCommand): Promise<unknown> {
  const { resourcePath: id, attempt } = pending.command;
  // APIs deliberately project HTTP inputs; local destination metadata never enters the body or fingerprint.
  const payload = structuredClone(pending.command.payload) as PaymentRequestCommandPayload;
  const key = attempt.idempotencyKey;
  switch (pending.kind) {
    case "create":
    case "update": {
      if (!("tenant_supplier_id" in payload)) throw new RangeError("草稿命令内容无效");
      return pending.kind === "create"
        ? api.createSupplierPaymentRequestDraft({ ...payload, expected_version: 0 }, key)
        : api.updateSupplierPaymentRequestDraft(id, payload, key);
    }
    case "pay":
      if (!("payment_method" in payload)) throw new RangeError("付款命令内容无效");
      return api.confirmSupplierPayment(id, payload, key);
    case "submit": return api.submitSupplierPaymentRequest(id, payload, key);
    case "approve": return api.approveSupplierPaymentRequest(id, payload, key);
    case "reject": return api.rejectSupplierPaymentRequest(id, { ...payload, remark: "remark" in payload ? payload.remark ?? "" : "" }, key);
    case "cancel":
    case "close": return (pending.kind === "cancel" ? api.cancelSupplierPaymentRequest : api.closeSupplierPaymentRequest)(id, {
      expected_version: payload.expected_version, reason: "reason" in payload ? payload.reason ?? "" : "",
    }, key);
  }
}

export async function runPaymentRequestCommand(pending: PendingPaymentRequestCommand) {
  if (pending.kind !== "create" && pending.kind !== "update" && !pending.amounts) {
    return { type: "uncertain" as const, message: "原请求缺少金额基线，不能安全自动重试；请求身份已保留，请联系管理员核对" };
  }
  try {
    const response = await sendPaymentRequestCommand(pending);
    const result = parsePaymentRequestReceipt(response, pending);
    return result ? { type: "accepted" as const, result }
      : { type: "uncertain" as const, message: "付款申请回执缺失或不一致，结果尚未确认" };
  } catch (caught) {
    const status = errorStatus(caught);
    const message = errorMessage(caught, "付款申请操作结果尚未确认");
    // A later denial cannot establish whether the earlier uncertain write committed.
    // Keep that original key; only a valid success receipt resolves its outcome.
    return pending.command.phase === "uncertain" || !status || status < 400 || status >= 500 || status === 408
      ? { type: "uncertain" as const, message }
      : { type: "rejected" as const, message, code: errorCode(caught), status };
  }
}

export function paymentCommandStorageKey(scope: string, slot: string) {
  return `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:supplier-payment:${slot}`;
}
const payloadSchema = z.object({ expected_version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).passthrough();
const storedSchema = z.object({
  scope: z.string(), slot: z.string(), pending: z.object({
    kind: z.enum(["create", "update", "submit", "approve", "reject", "cancel", "close", "pay"]),
    destination: z.object({ destination_type: z.enum(["project", "warehouse"]), project_id: z.uuid().nullable(), warehouse_id: z.uuid().nullable() }),
    amounts: z.unknown().optional(),
    requestNo: z.string().optional(),
    command: z.object({ resourcePath: z.uuid(), phase: z.enum(["in_flight", "uncertain"]), payload: payloadSchema,
      attempt: z.object({ fingerprint: z.string(), idempotencyKey: z.uuid() }) }),
  }),
});
export function restorePaymentRequestCommand(raw: string | null, scope: string, slot: string): PendingPaymentRequestCommand | null {
  if (!raw) return null;
  try {
    const stored = storedSchema.safeParse(JSON.parse(raw));
    if (!stored.success || stored.data.scope !== scope || stored.data.slot !== slot) return null;
    const { pending } = stored.data;
    return { kind: pending.kind, destination: freezeFinancialDestination(pending.destination),
      amounts: freezeAmounts(pending.amounts), requestNo: pending.requestNo,
      command: markFrozenCommandUncertain(beginFrozenCommand(pending.command.attempt, pending.command.payload, pending.command.resourcePath)) };
  } catch { return null; }
}
