import { requestBackendJson } from "@/lib/backend-client";

import type {
  SupplierPaymentCommandResult,
  SupplierPaymentConfirmInput,
  SupplierPaymentPage,
  SupplierPaymentRequestDetail,
  SupplierPaymentRequestDraftInput,
  SupplierPaymentRequestListQuery,
  SupplierPaymentRequestPage,
  SupplierPaymentRequestReasonInput,
  SupplierPaymentRequestRejectInput,
  SupplierPaymentRequestReviewInput,
  SupplierPaymentRequestSubmitInput,
  SupplierPaymentRequestUpdateDraftInput,
} from "./payment-request-types";

const REQUEST_PATH = "/supplier-payment-requests";
const MAX_PAGE_SIZE = 100;

export function listSupplierPaymentRequests(
  input: SupplierPaymentRequestListQuery,
): Promise<SupplierPaymentRequestPage> {
  return requestBackendJson<SupplierPaymentRequestPage>(
    `${REQUEST_PATH}?${listQuery(input)}`,
    { fallbackMessage: "供应商付款申请加载失败" },
  );
}

export function getSupplierPaymentRequest(
  requestId: string,
): Promise<SupplierPaymentRequestDetail> {
  return requestBackendJson<SupplierPaymentRequestDetail>(
    requestPath(requestId),
    { fallbackMessage: "供应商付款申请详情加载失败" },
  );
}

export function listSupplierPaymentRequestPayments(
  requestId: string,
  pagination: { page: number; pageSize: number },
): Promise<SupplierPaymentPage> {
  const query = new URLSearchParams({
    page: String(normalizePage(pagination.page)),
    pageSize: String(normalizePageSize(pagination.pageSize)),
  });
  return requestBackendJson<SupplierPaymentPage>(
    `${requestPath(requestId)}/payments?${query}`,
    { fallbackMessage: "供应商付款记录加载失败" },
  );
}

export function createSupplierPaymentRequestDraft(
  payload: SupplierPaymentRequestDraftInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCommandResult> {
  if (payload.expected_version !== 0) {
    throw new RangeError("新建付款申请草稿版本号必须为 0");
  }
  return command(
    REQUEST_PATH,
    "POST",
    draftPayload(payload),
    idempotencyKey,
    "供应商付款申请草稿创建失败",
  );
}

export function updateSupplierPaymentRequestDraft(
  requestId: string,
  payload: SupplierPaymentRequestUpdateDraftInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCommandResult> {
  requirePositiveVersion(payload.expected_version);
  return command(
    requestPath(requestId),
    "PUT",
    draftPayload(payload),
    idempotencyKey,
    "供应商付款申请草稿更新失败",
  );
}

export function submitSupplierPaymentRequest(
  requestId: string,
  payload: SupplierPaymentRequestSubmitInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCommandResult> {
  return requestCommand(
    requestId,
    "submit",
    versionPayload(payload),
    idempotencyKey,
    "供应商付款申请提交失败",
  );
}

export function approveSupplierPaymentRequest(
  requestId: string,
  payload: SupplierPaymentRequestReviewInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCommandResult> {
  return requestCommand(
    requestId,
    "approve",
    reviewPayload(payload),
    idempotencyKey,
    "供应商付款申请审批失败",
  );
}

export function rejectSupplierPaymentRequest(
  requestId: string,
  payload: SupplierPaymentRequestRejectInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCommandResult> {
  return requestCommand(
    requestId,
    "reject",
    reviewPayload(payload),
    idempotencyKey,
    "供应商付款申请驳回失败",
  );
}

export function cancelSupplierPaymentRequest(
  requestId: string,
  payload: SupplierPaymentRequestReasonInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCommandResult> {
  return requestCommand(
    requestId,
    "cancel",
    reasonPayload(payload),
    idempotencyKey,
    "供应商付款申请取消失败",
  );
}

export function closeSupplierPaymentRequest(
  requestId: string,
  payload: SupplierPaymentRequestReasonInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCommandResult> {
  return requestCommand(
    requestId,
    "close",
    reasonPayload(payload),
    idempotencyKey,
    "供应商付款申请关闭失败",
  );
}

export function confirmSupplierPayment(
  requestId: string,
  payload: SupplierPaymentConfirmInput,
  idempotencyKey: string,
): Promise<SupplierPaymentCommandResult> {
  return requestCommand(
    requestId,
    "payments",
    paymentPayload(payload),
    idempotencyKey,
    "供应商付款确认失败",
  );
}

function requestCommand(
  requestId: string,
  action: "submit" | "approve" | "reject" | "cancel" | "close" | "payments",
  payload: object,
  idempotencyKey: string,
  fallbackMessage: string,
) {
  return command(
    `${requestPath(requestId)}/${action}`,
    "POST",
    payload,
    idempotencyKey,
    fallbackMessage,
  );
}

function command(
  path: string,
  method: "POST" | "PUT",
  payload: object,
  idempotencyKey: string,
  fallbackMessage: string,
) {
  return requestBackendJson<SupplierPaymentCommandResult>(path, {
    method,
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
    fallbackMessage,
  });
}

function requestPath(requestId: string) {
  return `${REQUEST_PATH}/${encodeURIComponent(requestId)}`;
}

function listQuery(input: SupplierPaymentRequestListQuery) {
  const query = new URLSearchParams({
    page: String(normalizePage(input.page)),
    pageSize: String(normalizePageSize(input.pageSize)),
  });
  const filterKeys = [
    "project_id",
    "tenant_supplier_id",
    "status",
    "keyword",
    "created_from",
    "created_to",
  ] as const;
  for (const key of filterKeys) {
    const value = input[key];
    if (value) query.set(key, value);
  }
  return query;
}

function normalizePage(page: number) {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizePageSize(pageSize: number) {
  if (!Number.isInteger(pageSize)) return 20;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));
}

function draftPayload(
  payload: SupplierPaymentRequestDraftInput |
    SupplierPaymentRequestUpdateDraftInput,
) {
  return {
    id: payload.id,
    project_id: payload.project_id,
    tenant_supplier_id: payload.tenant_supplier_id,
    expected_version: payload.expected_version,
    reason: payload.reason,
    remark: payload.remark ?? null,
    allocations: payload.allocations.map((allocation) => ({
      payable_event_id: allocation.payable_event_id,
      requested_amount: allocation.requested_amount,
    })),
  };
}

function versionPayload(payload: SupplierPaymentRequestSubmitInput) {
  requirePositiveVersion(payload.expected_version);
  return { expected_version: payload.expected_version };
}

function reviewPayload(
  payload: SupplierPaymentRequestReviewInput |
    SupplierPaymentRequestRejectInput,
) {
  requirePositiveVersion(payload.expected_version);
  return {
    expected_version: payload.expected_version,
    remark: payload.remark ?? null,
  };
}

function reasonPayload(payload: SupplierPaymentRequestReasonInput) {
  requirePositiveVersion(payload.expected_version);
  return {
    expected_version: payload.expected_version,
    reason: payload.reason,
  };
}

function paymentPayload(payload: SupplierPaymentConfirmInput) {
  requirePositiveVersion(payload.expected_version);
  return {
    id: payload.id,
    expected_version: payload.expected_version,
    payment_method: payload.payment_method,
    payment_reference: payload.payment_reference,
    paid_at: payload.paid_at,
    evidence_images: [...payload.evidence_images],
    remark: payload.remark ?? null,
    allocations: payload.allocations.map((allocation) => ({
      payment_request_allocation_id:
        allocation.payment_request_allocation_id,
      payable_event_id: allocation.payable_event_id,
      amount: allocation.amount,
    })),
  };
}

function requirePositiveVersion(version: number) {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new RangeError("付款申请命令需要正整数版本号");
  }
}
