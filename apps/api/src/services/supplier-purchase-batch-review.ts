import { Errors } from "@/errors/error-factory";
import type { SupplierPurchaseBatchCommandResult } from
  "@/repositories/supplier-purchase-batches";
import type { SupplierPurchaseBatchDetail } from
  "@/repositories/supplier-purchase-batch-records";
import type { SupplierPurchaseBatchReviewInput } from
  "@/schema/supplier-purchase-batches";
import type { AuthContext } from "@/services/authorization";

type ReviewDependencies = {
  financeAccess: {
    requireFinanceBudgetManage(auth: AuthContext): unknown;
  };
  workflowBridge: {
    completeLegacyReview(input: {
      authContext: AuthContext;
      batch: SupplierPurchaseBatchDetail;
      action: string;
      reason: string | null;
      expectedVersion: number;
      output: Record<string, unknown>;
      idempotencyKey: string;
    }): Promise<unknown>;
  };
  repository: {
    review(input: {
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
};

export function assertSupplierPurchaseBatchReviewVersion(
  batch: { status: string; version: number },
  expectedVersion: number,
): void {
  if (batch.status === "pending_approval" &&
    batch.version !== expectedVersion) {
    throw Errors.business(
      409,
      "采购批次版本已变化，请刷新后重试",
      "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT",
    );
  }
}

export function assertLegacySupplierPurchaseBatchReviewSelf(
  batch: { created_by_employee_id: string },
  employeeId: string,
): void {
  if (batch.created_by_employee_id === employeeId) {
    throw Errors.business(
      409,
      "提交人不能审批自己提交的采购批次",
      "SUPPLIER_PURCHASE_BATCH_SELF_REVIEW",
    );
  }
}

export async function executeSupplierPurchaseBatchReview(input: {
  auth: AuthContext;
  tenantId: string;
  authUserId: string;
  employeeId: string;
  batch: SupplierPurchaseBatchDetail;
  review: SupplierPurchaseBatchReviewInput;
  idempotencyKey: string;
  workflowEnabled: boolean;
  dependencies: ReviewDependencies;
}): Promise<unknown> {
  if (input.workflowEnabled) {
    const result = await input.dependencies.workflowBridge.completeLegacyReview({
      authContext: input.auth,
      batch: input.batch,
      action: input.review.action,
      reason: input.review.remark ?? null,
      expectedVersion: input.review.expected_version,
      output: {},
      idempotencyKey: input.idempotencyKey,
    });
    return adaptWorkflowReviewResult(result);
  }

  const canOverrideBudget = input.review.action === "approve" &&
    input.batch.budget_status === "over_budget";
  if (canOverrideBudget) {
    input.dependencies.financeAccess.requireFinanceBudgetManage(input.auth);
  }
  const result = await input.dependencies.repository.review({
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
