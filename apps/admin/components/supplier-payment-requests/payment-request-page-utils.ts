import { SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES } from "@gooes/domain";

import { normalizeSupplierPayableIds } from "../supplier-payables/payable-id-batch";
import type { SupplierPayable } from "../supplier-payables/payable-types";
import { supplierPaymentCommandRefresh } from "./payment-request-command-refresh";
import type {
  SupplierPaymentRequest,
  SupplierPaymentRequestDetail,
  SupplierPaymentRequestListItem,
  SupplierPaymentRequestStatus,
} from "./payment-request-types";

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})\.\d{2}$/;
const REQUEST_STATUSES = new Set<string>(
  SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES,
);
const DETERMINISTIC_SAVE_CONFLICTS = new Set([
  "SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT",
  "SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE",
  "SUPPLIER_PAYMENT_ALLOCATION_INVALID",
  "SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT",
]);

export type PaymentRequestDraftLine = {
  allocationId?: string;
  payableEventId: string;
  source: string;
  dueAt: string;
  available: string;
  amount: string;
};

export type PaymentRequestWorkspaceState = {
  page: number;
  keyword: string;
  status: SupplierPaymentRequestStatus | "all";
  projectId: string;
  tenantSupplierId: string;
  createdFrom: string;
  createdTo: string;
  create: boolean;
  payableIds: string[];
};

export function readPaymentRequestWorkspaceState(
  searchParams: Pick<URLSearchParams, "get">,
): PaymentRequestWorkspaceState {
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawStatus = searchParams.get("status");
  const create = searchParams.get("create") === "1";
  const payableIdsValue = searchParams.get("payableIds");
  const payableIds = create
    ? normalizeSupplierPayableIds(payableIdsValue ?? "")
    : [];
  return {
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    keyword: searchParams.get("keyword")?.trim() ?? "",
    status: rawStatus && REQUEST_STATUSES.has(rawStatus)
      ? rawStatus as SupplierPaymentRequestStatus
      : "all",
    projectId: searchParams.get("project_id")?.trim() || "all",
    tenantSupplierId:
      searchParams.get("tenant_supplier_id")?.trim() || "all",
    createdFrom: searchParams.get("created_from")?.trim() ?? "",
    createdTo: searchParams.get("created_to")?.trim() ?? "",
    create,
    payableIds,
  };
}

export function buildPaymentRequestWorkspaceHref(
  state: PaymentRequestWorkspaceState,
): string {
  const query = new URLSearchParams();
  if (state.page > 1) query.set("page", String(state.page));
  if (state.keyword.trim()) query.set("keyword", state.keyword.trim());
  if (state.status !== "all") query.set("status", state.status);
  if (state.projectId !== "all") query.set("project_id", state.projectId);
  if (state.tenantSupplierId !== "all") {
    query.set("tenant_supplier_id", state.tenantSupplierId);
  }
  if (state.createdFrom) query.set("created_from", state.createdFrom);
  if (state.createdTo) query.set("created_to", state.createdTo);
  const encoded = query.toString();
  return `/supplier-payment-requests${encoded ? `?${encoded}` : ""}`;
}

export function validateDraftPayables(
  requestedIds: readonly string[],
  facts: readonly SupplierPayable[],
): SupplierPayable[] {
  const ids = normalizeSupplierPayableIds(requestedIds);
  const byId = new Map(facts.map((fact) => [fact.id.toLowerCase(), fact]));
  if (byId.size !== facts.length || byId.size !== ids.length) {
    throw new RangeError("所选应付已变化或无权访问，请重新选择");
  }
  const ordered = ids.map((id) => byId.get(id));
  if (ordered.some((fact) => fact === undefined)) {
    throw new RangeError("所选应付已变化或无权访问，请重新选择");
  }
  const payables = ordered as SupplierPayable[];
  const first = payables[0]!;
  if (payables.some((fact) =>
    fact.project_id !== first.project_id ||
    fact.tenant_supplier_id !== first.tenant_supplier_id ||
    fact.currency !== first.currency
  )) {
    throw new RangeError("付款申请只能包含同一项目、供应商和币种的应付");
  }
  if (payables.some((fact) =>
    moneyCents(fact.available_to_request_amount) <= BigInt(0)
  )) {
    throw new RangeError("所选应付可申请余额已变化，请重新选择");
  }
  return payables;
}

export function mergePaymentRequestDraftLines(
  detail: SupplierPaymentRequestDetail,
  freshFacts: readonly SupplierPayable[],
): PaymentRequestDraftLine[] {
  const ids = detail.allocations.map(({ payable_event_id }) =>
    payable_event_id
  );
  const payables = validateDraftPayables(ids, freshFacts);
  const request = detail.payment_request;
  if (payables.some((payable) =>
    payable.project_id !== request.project_id ||
    payable.tenant_supplier_id !== request.tenant_supplier_id ||
    payable.currency !== request.currency
  )) {
    throw new RangeError("应付事实与付款申请范围不一致，请重新加载");
  }
  return detail.allocations.map((allocation, index) => {
    const payable = payables[index];
    if (!payable || payable.id.toLowerCase() !==
        allocation.payable_event_id.toLowerCase()) {
      throw new RangeError("付款申请应付事实已变化，请重新加载");
    }
    return {
      allocationId: allocation.id,
      payableEventId: allocation.payable_event_id,
      source: `${payable.purchase_order_no} / ${payable.receipt_no}`,
      dueAt: payable.due_at,
      available: payable.available_to_request_amount,
      amount: allocation.requested_amount,
    };
  });
}

export function paymentRequestSaveFailureKind(
  code: string | undefined,
  status?: number,
): "reload_facts" | "retry_same_attempt" | "release_attempt" {
  if (code && DETERMINISTIC_SAVE_CONFLICTS.has(code)) return "reload_facts";
  return status === undefined || status >= 500
    ? "retry_same_attempt"
    : "release_attempt";
}

export function applyPaymentRequestCommand<
  ListItem extends SupplierPaymentRequestListItem | SupplierPaymentRequest,
>(
  list: ListItem[],
  detail: SupplierPaymentRequest | null,
  next: SupplierPaymentRequest,
) {
  return {
    list: list.map((record) => record.id === next.id
      ? { ...record, ...next }
      : record),
    detail: detail?.id === next.id ? next : detail,
    refresh: supplierPaymentCommandRefresh(),
  };
}

export function paymentRequestConflictMessage(code: string | undefined) {
  const messages: Record<string, string> = {
    SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT:
      "付款申请版本已变化，请刷新最新数据后再操作。",
    SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT:
      "付款申请状态已变化，请刷新最新数据后再操作。",
    SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE:
      "应付可申请或可付款余额已变化，请刷新最新数据。",
    SUPPLIER_PAYMENT_ALLOCATION_INVALID:
      "付款分配已失效，请刷新最新数据后重新确认。",
    SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED:
      "付款需要正式发票能力，请刷新并核对发票门禁。",
  };
  return code ? messages[code] ?? null : null;
}

export function paymentRequestCreatedDateRange(from: string, to: string) {
  const start = from ? localDateBoundary(from, "start") : null;
  const end = to ? localDateBoundary(to, "end") : null;
  if (start && end && start.getTime() > end.getTime()) {
    throw new RangeError("创建结束日期不能早于开始日期");
  }
  return {
    ...(start ? { created_from: start.toISOString() } : {}),
    ...(end ? { created_to: end.toISOString() } : {}),
  };
}

export function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
    ? error.code
    : undefined;
}

export function errorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error &&
      typeof error.status === "number"
    ? error.status
    : undefined;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function formatPaymentMoney(value: string) {
  const cents = moneyCents(value);
  const integer = (cents / BigInt(100)).toString().replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `¥${integer}.${
    (cents % BigInt(100)).toString().padStart(2, "0")
  }`;
}

export function moneyCents(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) throw new RangeError("无效的金额格式");
  const [integer, fraction] = value.split(".");
  return BigInt(integer!) * BigInt(100) + BigInt(fraction!);
}

export function decimalFromCents(value: bigint): string {
  return `${value / BigInt(100)}.${
    (value % BigInt(100)).toString().padStart(2, "0")
  }`;
}

function localDateBoundary(value: string, boundary: "start" | "end") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("无效的创建日期");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(
    boundary === "start" ? 0 : 23,
    boundary === "start" ? 0 : 59,
    boundary === "start" ? 0 : 59,
    boundary === "start" ? 0 : 999,
  );
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new RangeError("无效的创建日期");
  }
  return date;
}
