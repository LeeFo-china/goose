import type {
  SupplierCommandAttempt,
  SupplierResourceCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";
import { requestBackendJson } from "@/lib/backend-client";

import type {
  RequisitionBudgetStatus,
  RequisitionCancelInput,
  RequisitionCommandResult,
  RequisitionConvertInput,
  RequisitionCreateDraftInput,
  RequisitionDetail,
  RequisitionItemPage,
  RequisitionPage,
  RequisitionReviewInput,
  RequisitionStatus,
  RequisitionSubmitInput,
  RequisitionUpdateDraftInput,
} from "./requisition-types";

const REQUISITION_PATH = "/supplier-purchase-requisitions";
const LIST_PAGE_SIZE = 20;
const MAX_ITEM_PAGE_SIZE = 100;

export type RequisitionFilters = {
  keyword?: string;
  status?: RequisitionStatus;
  budget_status?: RequisitionBudgetStatus;
  project_id?: string;
  tenant_supplier_id?: string;
};

export function loadRequisitions(
  page: number,
  filters: RequisitionFilters = {},
) {
  const query = new URLSearchParams({
    page: String(normalizePage(page)),
    pageSize: String(LIST_PAGE_SIZE),
  });
  const filterKeys = [
    "keyword",
    "status",
    "budget_status",
    "project_id",
    "tenant_supplier_id",
  ] as const;
  for (const key of filterKeys) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  return requestBackendJson<RequisitionPage>(
    `${REQUISITION_PATH}?${query}`,
    { fallbackMessage: "采购申请加载失败" },
  );
}

export function loadRequisition(requisitionId: string) {
  return requestBackendJson<RequisitionDetail>(
    requisitionPath(requisitionId),
    { fallbackMessage: "采购申请详情加载失败" },
  );
}

export function loadRequisitionItems(
  requisitionId: string,
  page = 1,
  pageSize = MAX_ITEM_PAGE_SIZE,
) {
  const query = new URLSearchParams({
    page: String(normalizePage(page)),
    pageSize: String(normalizeItemPageSize(pageSize)),
  });
  return requestBackendJson<RequisitionItemPage>(
    `${requisitionPath(requisitionId)}/items?${query}`,
    { fallbackMessage: "采购申请明细加载失败" },
  );
}

export function createRequisitionDraft(
  payload: RequisitionCreateDraftInput,
  attempt: SupplierResourceCommandAttempt,
) {
  if (payload.expected_version !== 0) {
    throw new RangeError("新建采购申请草稿版本号必须为 0");
  }
  return requisitionCommand(
    attempt.resourceId,
    "save-draft",
    payload,
    attempt,
    "采购申请草稿创建失败",
  );
}

export function updateRequisitionDraft(
  requisitionId: string,
  payload: RequisitionUpdateDraftInput,
  attempt: SupplierCommandAttempt,
) {
  if (
    !Number.isSafeInteger(payload.expected_version) ||
    payload.expected_version <= 0
  ) {
    throw new RangeError("更新采购申请草稿需要正整数版本号");
  }
  return requisitionCommand(
    requisitionId,
    "save-draft",
    payload,
    attempt,
    "采购申请草稿更新失败",
  );
}

export function submitRequisition(
  requisitionId: string,
  payload: RequisitionSubmitInput,
  attempt: SupplierCommandAttempt,
) {
  return requisitionCommand(
    requisitionId,
    "submit",
    payload,
    attempt,
    "采购申请提交失败",
  );
}

export function reviewRequisition(
  requisitionId: string,
  payload: RequisitionReviewInput,
  attempt: SupplierCommandAttempt,
) {
  return requisitionCommand(
    requisitionId,
    "review",
    payload,
    attempt,
    "采购申请审核失败",
  );
}

export function cancelRequisition(
  requisitionId: string,
  payload: RequisitionCancelInput,
  attempt: SupplierCommandAttempt,
) {
  return requisitionCommand(
    requisitionId,
    "cancel",
    payload,
    attempt,
    "采购申请取消失败",
  );
}

export function convertRequisition(
  requisitionId: string,
  payload: RequisitionConvertInput,
  attempt: SupplierResourceCommandAttempt,
) {
  return requisitionCommand(
    requisitionId,
    "convert",
    {
      ...payload,
      purchase_order_id: attempt.resourceId,
    },
    attempt,
    "采购申请生成采购单失败",
  );
}

function requisitionCommand(
  requisitionId: string,
  command: "save-draft" | "submit" | "review" | "cancel" | "convert",
  payload: object,
  attempt: SupplierCommandAttempt,
  fallbackMessage: string,
) {
  return requestBackendJson<RequisitionCommandResult>(
    `${requisitionPath(requisitionId)}/${command}`,
    {
      method: "POST",
      headers: { "Idempotency-Key": attempt.idempotencyKey },
      body: JSON.stringify(payload),
      fallbackMessage,
    },
  );
}

function requisitionPath(requisitionId: string) {
  return `${REQUISITION_PATH}/${encodeURIComponent(requisitionId)}`;
}

function normalizePage(page: number) {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeItemPageSize(pageSize: number) {
  if (!Number.isInteger(pageSize)) return MAX_ITEM_PAGE_SIZE;
  return Math.min(MAX_ITEM_PAGE_SIZE, Math.max(1, pageSize));
}
