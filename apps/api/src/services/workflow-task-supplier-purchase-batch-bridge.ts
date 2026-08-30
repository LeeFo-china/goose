import { Errors } from "@/errors/error-factory";
import {
  supplierPurchaseBatchWorkflowRepository,
  type SupplierPurchaseBatchWorkflowReviewInput,
} from "@/repositories/supplier-purchase-batch-workflow";
import {
  SupplierPurchaseBatchesRepository,
} from "@/repositories/supplier-purchase-batches";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const NODE_PERMISSION = {
  purchase_review: "supplier.purchase-requisition.approve",
  finance_review: "finance.budget.manage",
} as const;
const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

type SupplierReviewNodeKey = keyof typeof NODE_PERMISSION;

type BridgeInput = {
  authContext: AuthContext;
  task: {
    id: string;
    tenant_id: string;
    node_key: string;
    instance: { subject_id: string };
  };
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
  idempotencyKey: string | null;
};

type Dependencies = {
  repository: {
    completeTask: (
      input: SupplierPurchaseBatchWorkflowReviewInput,
    ) => Promise<unknown>;
  };
  batchesRepository: {
    findBatch: (tenantId: string, batchId: string) => Promise<{
      tenant_id: string;
      project_id: string;
      submitted_by_employee_id: string | null;
    } | null>;
  };
  accessPolicy: Pick<
    typeof accessPolicyService,
    "hasPermission" | "canAccessProject"
  >;
};

export class WorkflowTaskSupplierPurchaseBatchBridge {
  constructor(private readonly dependencies: Dependencies = {
    repository: supplierPurchaseBatchWorkflowRepository,
    batchesRepository: new SupplierPurchaseBatchesRepository(),
    accessPolicy: accessPolicyService,
  }) {}

  async complete(input: BridgeInput) {
    const nodeKey = input.task.node_key as SupplierReviewNodeKey;
    if (!(nodeKey in NODE_PERMISSION)) return null;
    const action = input.action.trim();
    if (action !== "approve" && action !== "reject") {
      throw Errors.badRequest("采购审批动作必须为 approve 或 reject");
    }
    const reason = input.reason?.trim() || null;
    if (action === "reject" && !reason) {
      throw Errors.badRequest("驳回采购批次必须填写原因");
    }
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw Errors.business(
        400,
        "缺少有效的 Idempotency-Key",
        "VALIDATION_ERROR",
      );
    }

    const permissionCode = NODE_PERMISSION[nodeKey];
    this.assertPermissions(input.authContext, permissionCode);
    const batch = await this.dependencies.batchesRepository.findBatch(
      input.task.tenant_id,
      input.task.instance.subject_id,
    );
    if (!batch) throw Errors.notFound("供应商采购批次不存在");
    if (batch.submitted_by_employee_id === input.authContext.employeeId) {
      throw Errors.business(
        409,
        "提交人不能审批自己提交的采购批次",
        "SUPPLIER_PURCHASE_BATCH_SELF_REVIEW",
      );
    }
    const canReadProject = await this.dependencies.accessPolicy.canAccessProject(
      input.authContext,
      batch.project_id,
      "project.read",
    );
    const canReviewProject = canReadProject &&
      await this.dependencies.accessPolicy.canAccessProject(
        input.authContext,
        batch.project_id,
        permissionCode,
      );
    if (!canReviewProject) throw Errors.forbidden();
    if (!input.authContext.authUserId || !input.authContext.employeeId) {
      throw Errors.forbidden();
    }

    return this.dependencies.repository.completeTask({
      tenantId: input.task.tenant_id,
      batchId: input.task.instance.subject_id,
      taskId: input.task.id,
      action,
      reason,
      output: { ...input.output, reason },
      actorUserId: input.authContext.authUserId,
      actorEmployeeId: input.authContext.employeeId,
      idempotencyKey,
    });
  }

  private assertPermissions(authContext: AuthContext, permissionCode: string) {
    for (const required of [
      "supplier.purchase-requisition.view",
      "project.read",
      permissionCode,
    ]) {
      if (!this.dependencies.accessPolicy.hasPermission(authContext, required)) {
        throw Errors.forbidden();
      }
    }
  }
}

export const workflowTaskSupplierPurchaseBatchBridge =
  new WorkflowTaskSupplierPurchaseBatchBridge();
