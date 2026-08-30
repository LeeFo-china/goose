import { Errors } from "@/errors/error-factory";
import type { SupplierPurchaseBatchCommandResult } from
  "@/repositories/supplier-purchase-batches";
import type { SupplierPurchaseBatchDetail } from
  "@/repositories/supplier-purchase-batch-records";
import type { SupplierPurchaseBatchReviewInput } from
  "@/schema/supplier-purchase-batches";
import type { AuthContext } from "@/services/authorization";

type ReviewDependencies = {
  requireFinanceBudgetManage(auth: AuthContext): unknown;
  isWorkflowEnabled(tenantId: string): Promise<boolean>;
  completeLegacyReview(input: {
    authContext: AuthContext;
    batch: SupplierPurchaseBatchDetail;
    action: string;
    reason: string | null;
    output: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<unknown>;
  reviewLegacy(input: {
    tenant_id: string;
    batch_id: string;
    expected_version: number;
    actor_user_id: string;
    actor_employee_id: string;
    idempotency_key: string;
    action: "approve" | "reject";
    remark: string | null;
    can_override_budget: boolean;
  }): Promise<SupplierPurchaseBatchCommandResult>;
};

export async function executeSupplierPurchaseBatchReview(input: {
  auth: AuthContext;
  tenantId: string;
  authUserId: string;
  employeeId: string;
  batch: SupplierPurchaseBatchDetail;
  review: SupplierPurchaseBatchReviewInput;
  idempotencyKey: string;
  dependencies: ReviewDependencies;
}): Promise<unknown> {
  if (await input.dependencies.isWorkflowEnabled(input.tenantId)) {
    const result = await input.dependencies.completeLegacyReview({
      authContext: input.auth,
      batch: input.batch,
      action: input.review.action,
      reason: input.review.remark ?? null,
      output: { compat_source: "supplier_purchase_batch_review" },
      idempotencyKey: input.idempotencyKey,
    });
    return adaptWorkflowReviewResult(result);
  }

  const canOverrideBudget = input.review.action === "approve" &&
    input.batch.budget_status === "over_budget";
  if (canOverrideBudget) {
    input.dependencies.requireFinanceBudgetManage(input.auth);
  }
  const result = await input.dependencies.reviewLegacy({
    tenant_id: input.tenantId,
    batch_id: input.batch.id,
    expected_version: input.review.expected_version,
    actor_user_id: input.authUserId,
    actor_employee_id: input.employeeId,
    idempotency_key: input.idempotencyKey,
    action: input.review.action,
    remark: input.review.remark ?? null,
    can_override_budget: canOverrideBudget,
  });
  if (result.status === "revision_required") throwRevisionRequired(result);
  return result;
}

function adaptWorkflowReviewResult(result: unknown): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }
  const record = result as Record<string, unknown>;
  if (record.status === "pending_approval") return record;
  const { workflow_state: _workflowState, ...legacyResult } = record;
  return legacyResult;
}

function throwRevisionRequired(
  result: Extract<
    SupplierPurchaseBatchCommandResult,
    { status: "revision_required" }
  >,
): never {
  throw Errors.business(
    409,
    "采购批次数据已变化，请刷新并修订后重新提交",
    result.error_code,
    {
      batch: result.batch,
      version: result.version,
      error_code: result.error_code,
      details: result.details,
    },
  );
}
