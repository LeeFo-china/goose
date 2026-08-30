import { Errors } from "@/errors/error-factory";
import {
  supplierPurchaseBatchWorkflowRepository,
  type SupplierPurchaseBatchWorkflowReviewInput,
} from "@/repositories/supplier-purchase-batch-workflow";
import {
  supplierPurchaseBatchWorkflowReviewLookupRepository,
  type SupplierPurchaseBatchPendingWorkflowTask,
  type SupplierPurchaseBatchRunningWorkflowInstance,
  type SupplierPurchaseBatchWorkflowReviewEvent,
} from "@/repositories/supplier-purchase-batch-workflow-review-lookup";
import { SupplierPurchaseBatchAccessRepository } from
  "@/repositories/supplier-purchase-batch-access";
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
    findBatchAccessContext: (tenantId: string, batchId: string) => Promise<{
      tenant_id: string;
      project_id: string;
      submitted_by_employee_id: string | null;
    } | null>;
  };
  accessPolicy: Pick<
    typeof accessPolicyService,
    "hasPermission" | "canAccessProject"
  >;
  lookupRepository: {
    listRunningInstances(input: {
      tenantId: string;
      batchId: string;
    }): Promise<SupplierPurchaseBatchRunningWorkflowInstance[]>;
    listPendingTasks(input: {
      tenantId: string;
      instanceId: string;
    }): Promise<SupplierPurchaseBatchPendingWorkflowTask[]>;
    listReviewEvents(input: {
      tenantId: string;
      batchId: string;
      idempotencyKey?: string;
    }): Promise<SupplierPurchaseBatchWorkflowReviewEvent[]>;
    listTasksById(input: {
      tenantId: string;
      taskId: string;
    }): Promise<SupplierPurchaseBatchPendingWorkflowTask[]>;
    listInstancesById(input: {
      tenantId: string;
      instanceId: string;
    }): Promise<SupplierPurchaseBatchRunningWorkflowInstance[]>;
  };
};

type LegacyReviewInput = {
  authContext: AuthContext;
  batch: {
    id: string;
    tenant_id: string;
    approval_round?: number;
  };
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
  idempotencyKey: string | null;
};

const DEFAULT_DEPENDENCIES: Dependencies = {
  repository: supplierPurchaseBatchWorkflowRepository,
  batchesRepository: new SupplierPurchaseBatchAccessRepository(),
  accessPolicy: accessPolicyService,
  lookupRepository: supplierPurchaseBatchWorkflowReviewLookupRepository,
};

export class WorkflowTaskSupplierPurchaseBatchBridge {
  private readonly dependencies: Dependencies;

  constructor(dependencies: Partial<Dependencies> = {}) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  async completeLegacyReview(input: LegacyReviewInput) {
    const exactEvents = await this.dependencies.lookupRepository
      .listReviewEvents({
        tenantId: input.batch.tenant_id,
        batchId: input.batch.id,
        idempotencyKey: input.idempotencyKey ?? undefined,
      });
    if (exactEvents.length > 1) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    if (exactEvents[0]) {
      return this.completeFromReviewEvent(input, exactEvents[0]);
    }

    const instances = await this.dependencies.lookupRepository
      .listRunningInstances({
        tenantId: input.batch.tenant_id,
        batchId: input.batch.id,
      });
    if (instances.length === 0) {
      return this.completeLaggingReview(input);
    }
    if (instances.length !== 1) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    const [instance] = instances;
    if (!instance) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    if (instance.tenant_id !== input.batch.tenant_id ||
      instance.subject_type !== "supplier_purchase_batch" ||
      instance.subject_id !== input.batch.id) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    this.assertApprovalRound(input.batch.approval_round, instance.context);

    const pendingTasks = await this.dependencies.lookupRepository
      .listPendingTasks({
        tenantId: input.batch.tenant_id,
        instanceId: instance.id,
      });
    if (pendingTasks.length === 0) {
      return this.completeLaggingReview(input);
    }
    if (pendingTasks.length !== 1) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    const [task] = pendingTasks;
    if (!task || task.tenant_id !== input.batch.tenant_id ||
      task.instance_id !== instance.id || task.status !== "pending" ||
      !instance.current_node_key ||
      task.node_key !== instance.current_node_key ||
      (task.node_key !== "purchase_review" &&
        task.node_key !== "finance_review")) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    return this.completeResolvedTask(input, task, instance);
  }

  private async completeLaggingReview(input: LegacyReviewInput) {
    const events = await this.dependencies.lookupRepository.listReviewEvents({
      tenantId: input.batch.tenant_id,
      batchId: input.batch.id,
    });
    if (events.length === 0) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING",
      );
    }
    const currentRound = input.batch.approval_round;
    const event = events.find((candidate) => {
      const reference = reviewEventReference(candidate.request);
      return reference?.approvalRound === currentRound;
    });
    if (!event) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING",
      );
    }
    return this.completeFromReviewEvent(input, event);
  }

  private async completeFromReviewEvent(
    input: LegacyReviewInput,
    event: SupplierPurchaseBatchWorkflowReviewEvent,
  ) {
    const reference = reviewEventReference(event.request);
    if (!reference || reference.tenantId !== input.batch.tenant_id ||
      reference.batchId !== input.batch.id) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    this.assertApprovalRound(
      input.batch.approval_round,
      { approval_round: reference.approvalRound },
    );
    const tasks = await this.dependencies.lookupRepository.listTasksById({
      tenantId: input.batch.tenant_id,
      taskId: reference.taskId,
    });
    if (tasks.length !== 1 || !tasks[0]) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    const task = tasks[0];
    const instances = await this.dependencies.lookupRepository
      .listInstancesById({
        tenantId: input.batch.tenant_id,
        instanceId: task.instance_id,
      });
    if (instances.length !== 1 || !instances[0]) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    const instance = instances[0];
    if (task.id !== reference.taskId ||
      task.tenant_id !== input.batch.tenant_id ||
      instance.tenant_id !== input.batch.tenant_id ||
      instance.subject_type !== "supplier_purchase_batch" ||
      instance.subject_id !== input.batch.id ||
      (task.node_key !== "purchase_review" &&
        task.node_key !== "finance_review") ||
      (task.status === "pending" && (
        instance.status !== "running" ||
        instance.current_node_key !== task.node_key
      ))) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    this.assertApprovalRound(input.batch.approval_round, instance.context);
    return this.completeResolvedTask(input, task, instance);
  }

  private async completeResolvedTask(
    input: LegacyReviewInput,
    task: SupplierPurchaseBatchPendingWorkflowTask,
    instance: SupplierPurchaseBatchRunningWorkflowInstance,
  ) {
    this.assertTaskAssignee(input.authContext, task);
    const result = await this.complete({
      authContext: input.authContext,
      task: {
        id: task.id,
        tenant_id: task.tenant_id,
        node_key: task.node_key,
        instance: { subject_id: instance.subject_id },
      },
      action: input.action,
      reason: input.reason,
      output: input.output,
      idempotencyKey: input.idempotencyKey,
    });
    if (!result) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    return result;
  }

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
    const batch = await this.dependencies.batchesRepository.findBatchAccessContext(
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

  private assertApprovalRound(
    batchApprovalRound: number | undefined,
    context: Record<string, unknown>,
  ): void {
    const instanceApprovalRound = context.approval_round;
    if (!Number.isInteger(batchApprovalRound) ||
      !Number.isInteger(instanceApprovalRound)) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    }
    if (batchApprovalRound !== instanceApprovalRound) {
      throw workflowResolutionError(
        "SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE",
      );
    }
  }

  private assertTaskAssignee(
    authContext: AuthContext,
    task: {
      assignee_employee_id: string | null;
      assignee_role_code: string | null;
      assignee_permission_code: string | null;
    },
  ): void {
    if (task.assignee_employee_id) {
      if (task.assignee_employee_id !== authContext.employeeId) {
        throw Errors.forbidden();
      }
      return;
    }
    if (task.assignee_role_code) {
      if (!authContext.roleCodes.includes(task.assignee_role_code)) {
        throw Errors.forbidden();
      }
      return;
    }
    if (task.assignee_permission_code &&
      !this.dependencies.accessPolicy.hasPermission(
        authContext,
        task.assignee_permission_code,
      )) {
      throw Errors.forbidden();
    }
  }
}

function workflowResolutionError(code:
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

function reviewEventReference(request: Record<string, unknown>): {
  tenantId: string;
  batchId: string;
  taskId: string;
  approvalRound: number;
} | null {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export const workflowTaskSupplierPurchaseBatchBridge =
  new WorkflowTaskSupplierPurchaseBatchBridge();
