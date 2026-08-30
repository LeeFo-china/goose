import { Errors } from "@/errors/error-factory";

export type SupplierPurchaseBatchReviewEventReference = {
  tenantId: string;
  batchId: string;
  taskId: string;
  approvalRound: number;
};

export function reviewEventReference(
  request: Record<string, unknown>,
): SupplierPurchaseBatchReviewEventReference | null {
  const nested = asRecord(request.workflow_task_request);
  const workflowRequest = nested ?? request;
  const tenantId = workflowRequest.tenant_id;
  const batchId = workflowRequest.batch_id;
  const taskId = workflowRequest.task_id;
  const approvalRound = workflowRequest.approval_round;
  if (typeof tenantId !== "string" || typeof batchId !== "string" ||
    typeof taskId !== "string" || !Number.isInteger(approvalRound)) {
    return null;
  }
  return { tenantId, batchId, taskId, approvalRound: approvalRound as number };
}

export function isPureLegacyReviewEvent(
  request: Record<string, unknown>,
): boolean {
  return !("workflow_task_request" in request) &&
    !("workflow_task_fingerprint" in request) && !("task_id" in request);
}

export function workflowResolutionError(code:
  | "SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING"
  | "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT"
  | "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE") {
  const message = code === "SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING"
    ? "采购批次审批流程未配置或未发布"
    : code === "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE"
    ? "采购批次审批任务已属于旧轮次"
    : "采购批次审批流程状态冲突，请刷新后重试";
  return Errors.business(409, message, code);
}

export function hasReservedCompatibilityMetadata(
  output: Record<string, unknown>,
): boolean {
  return Object.hasOwn(output, "compat_source") ||
    Object.hasOwn(output, "compat_expected_version");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
