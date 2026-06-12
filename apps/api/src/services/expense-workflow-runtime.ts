import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import {
  workflowRepository,
  type JsonObject,
  type WorkflowDefinitionRow,
  type WorkflowInstanceRow,
  type WorkflowRuntimeCancelResult,
  type WorkflowRuntimeCompleteNodeResult,
} from "@/repositories/workflows";
import type { ExpenseRequestRecord } from "@/repositories/expense-requests";
import type { AuthContext } from "@/services/authorization";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";

type ExpenseWorkflowRuntimeStatus = "started" | "advanced" | "canceled" | "skipped" | "failed";

export type ExpenseWorkflowRuntimeMetadata = {
  status: ExpenseWorkflowRuntimeStatus;
  workflow_key?: string;
  definition_id?: string;
  instance_id?: string;
  node_key?: string;
  current_node_key?: string | null;
  next_node_key?: string | null;
  reason?: string;
  error_message?: string;
};

type BaseExpenseWorkflowInput = {
  authContext: AuthContext;
  tenantId: string;
  expenseRequestId: string;
  expenseRequest: ExpenseRequestRecord | null;
};

type SyncSubmitInput = BaseExpenseWorkflowInput & {
  action: "submit" | "resubmit";
  operatorId: string;
  comment?: string | null;
};

type SyncApprovalInput = BaseExpenseWorkflowInput & {
  nodeKey: "manager_review" | "finance_review";
  action: "approve" | "reject";
  actorEmployeeId: string;
  decision: "approved" | "rejected";
  comment?: string | null;
  reason?: string | null;
};

type SyncPayInput = BaseExpenseWorkflowInput & {
  actorEmployeeId: string;
  remark?: string | null;
};

type SyncCancelInput = BaseExpenseWorkflowInput & {
  actorEmployeeId: string;
  reason?: string | null;
  comment?: string | null;
};

class ExpenseWorkflowRuntimeService {
  async syncSubmit(input: SyncSubmitInput): Promise<ExpenseWorkflowRuntimeMetadata> {
    return this.runSafely(() => this.syncSubmitUnsafe(input));
  }

  async syncApproval(input: SyncApprovalInput): Promise<ExpenseWorkflowRuntimeMetadata> {
    return this.runSafely(() => this.syncApprovalUnsafe(input));
  }

  async syncPay(input: SyncPayInput): Promise<ExpenseWorkflowRuntimeMetadata> {
    return this.runSafely(() => this.syncPayUnsafe(input));
  }

  async syncCancel(input: SyncCancelInput): Promise<ExpenseWorkflowRuntimeMetadata> {
    return this.runSafely(() => this.syncCancelUnsafe(input));
  }

  private async syncSubmitUnsafe(input: SyncSubmitInput): Promise<ExpenseWorkflowRuntimeMetadata> {
    const definition = await this.findActiveExpenseWorkflow(input.tenantId);
    if (!definition) {
      return { status: "skipped", reason: "active_expense_workflow_not_found" };
    }

    const existing = await this.findRunningExpenseInstance(input, definition.id);
    if (existing) {
      await this.assignPendingTask({
        tenantId: input.tenantId,
        instanceId: existing.id,
        expenseRequest: input.expenseRequest,
      });
      await this.syncSubjectState(input, definition.id, existing.id);
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: existing.id,
        current_node_key: existing.current_node_key,
        reason: "running_instance_exists",
      };
    }

    const result = await workflowRepository.startRuntimeInstance({
      tenantId: input.tenantId,
      definitionId: definition.id,
      subjectType: "expense_request",
      subjectId: input.expenseRequestId,
      startedBy: input.operatorId,
      context: this.buildContext(input, {
        action: input.action,
        comment: input.comment ?? null,
      }),
    });

    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        reason: result.reason,
      };
    }

    await this.assignPendingTask({
      tenantId: input.tenantId,
      instanceId: result.instance.id,
      expenseRequest: input.expenseRequest,
    });
    await this.syncSubjectState(input, definition.id, result.instance.id);

    return {
      status: "started",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      current_node_key: result.instance.current_node_key,
    };
  }

  private async syncApprovalUnsafe(input: SyncApprovalInput): Promise<ExpenseWorkflowRuntimeMetadata> {
    const definition = await this.findActiveExpenseWorkflow(input.tenantId);
    if (!definition) {
      return { status: "skipped", reason: "active_expense_workflow_not_found" };
    }

    const instance = await this.findRunningExpenseInstance(input, definition.id);
    if (!instance) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        reason: "running_instance_not_found",
      };
    }

    const output = this.buildContext(input, {
      action: input.action,
      decision: input.decision,
      comment: input.comment ?? null,
      reason: input.reason ?? null,
    });
    const result = await workflowRepository.completeRuntimeNode({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      nodeKey: input.nodeKey,
      action: input.action,
      output,
      actorEmployeeId: input.actorEmployeeId,
    });

    return this.handleCompleteResult(input, definition, instance, input.nodeKey, result);
  }

  private async syncPayUnsafe(input: SyncPayInput): Promise<ExpenseWorkflowRuntimeMetadata> {
    const definition = await this.findActiveExpenseWorkflow(input.tenantId);
    if (!definition) {
      return { status: "skipped", reason: "active_expense_workflow_not_found" };
    }

    const instance = await this.findRunningExpenseInstance(input, definition.id);
    if (!instance) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        reason: "running_instance_not_found",
      };
    }

    const result = await workflowRepository.completeRuntimeNode({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      nodeKey: "payment",
      action: "pay",
      output: this.buildContext(input, {
        action: "pay",
        decision: "paid",
        remark: input.remark ?? null,
      }),
      actorEmployeeId: input.actorEmployeeId,
    });

    return this.handleCompleteResult(input, definition, instance, "payment", result);
  }

  private async syncCancelUnsafe(input: SyncCancelInput): Promise<ExpenseWorkflowRuntimeMetadata> {
    const definition = await this.findActiveExpenseWorkflow(input.tenantId);
    if (!definition) {
      return { status: "skipped", reason: "active_expense_workflow_not_found" };
    }

    const instance = await this.findRunningExpenseInstance(input, definition.id);
    if (!instance) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        reason: "running_instance_not_found",
      };
    }

    const result = await workflowRepository.cancelRuntimeInstance({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      reason: input.reason ?? input.comment ?? null,
      context: this.buildContext(input, {
        action: "cancel",
        comment: input.comment ?? null,
        reason: input.reason ?? null,
      }),
      actorEmployeeId: input.actorEmployeeId,
    });

    return this.handleCancelResult(input, definition, instance, result);
  }

  private async handleCompleteResult(
    input: BaseExpenseWorkflowInput,
    definition: WorkflowDefinitionRow,
    instance: WorkflowInstanceRow,
    nodeKey: string,
    result: WorkflowRuntimeCompleteNodeResult,
  ): Promise<ExpenseWorkflowRuntimeMetadata> {
    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: instance.id,
        node_key: nodeKey,
        current_node_key: result.currentNodeKey ?? instance.current_node_key,
        reason: result.reason,
      };
    }

    await this.assignPendingTask({
      tenantId: input.tenantId,
      instanceId: result.instance.id,
      expenseRequest: input.expenseRequest,
    });
    await this.syncSubjectState(input, definition.id, result.instance.id);

    return {
      status: "advanced",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      node_key: nodeKey,
      current_node_key: result.instance.current_node_key,
      next_node_key: this.getNodeKey(result.nextNode),
    };
  }

  private async handleCancelResult(
    input: BaseExpenseWorkflowInput,
    definition: WorkflowDefinitionRow,
    instance: WorkflowInstanceRow,
    result: WorkflowRuntimeCancelResult,
  ): Promise<ExpenseWorkflowRuntimeMetadata> {
    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: instance.id,
        current_node_key: instance.current_node_key,
        reason: result.reason,
      };
    }

    await this.syncSubjectState(input, definition.id, result.instance.id);
    return {
      status: "canceled",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      current_node_key: result.instance.current_node_key,
    };
  }

  private async findActiveExpenseWorkflow(tenantId: string): Promise<WorkflowDefinitionRow | null> {
    const definition = await workflowRepository.findDefinitionByKey(
      tenantId,
      "expense_approval",
    );
    return definition?.status === "active" && definition.active_version_id
      ? definition
      : null;
  }

  private async findRunningExpenseInstance(
    input: Pick<BaseExpenseWorkflowInput, "tenantId" | "expenseRequestId">,
    definitionId: string,
  ): Promise<WorkflowInstanceRow | null> {
    const result = await workflowRepository.listRuntimeInstances({
      tenantId: input.tenantId,
      definitionId,
      subjectType: "expense_request",
      subjectId: input.expenseRequestId,
      status: "running",
      page: 1,
      pageSize: 1,
    });

    return result.list[0] ?? null;
  }

  private async assignPendingTask(input: {
    tenantId: string;
    instanceId: string;
    expenseRequest: ExpenseRequestRecord | null;
  }) {
    const nodeKey = input.expenseRequest?.current_step;
    if (!nodeKey) return;

    await workflowTaskRepository.assignPendingTask({
      tenantId: input.tenantId,
      instanceId: input.instanceId,
      nodeKey,
      assigneeEmployeeId: input.expenseRequest?.assignee_id ?? null,
    });
  }

  private async syncSubjectState(
    input: BaseExpenseWorkflowInput,
    definitionId: string,
    instanceId: string,
  ) {
    await workflowSubjectStateService.syncFromRuntimeInstance({
      tenantId: input.tenantId,
      subjectType: "expense_request",
      subjectId: input.expenseRequestId,
      definitionId,
      instanceId,
    });
  }

  private buildContext(
    input: BaseExpenseWorkflowInput,
    extraContext: Record<string, unknown>,
  ): JsonObject {
    return {
      source: "expense_request_legacy",
      expense_request_id: input.expenseRequestId,
      employee_id: input.expenseRequest?.employee_id ?? null,
      project_id: input.expenseRequest?.project_id ?? null,
      status: input.expenseRequest?.status ?? null,
      current_step: input.expenseRequest?.current_step ?? null,
      total_amount: input.expenseRequest?.total_amount ?? null,
      operator_employee_id: input.authContext.employeeId ?? null,
      operator_auth_user_id: input.authContext.authUserId ?? null,
      ...extraContext,
    };
  }

  private async runSafely(
    operation: () => Promise<ExpenseWorkflowRuntimeMetadata>,
  ): Promise<ExpenseWorkflowRuntimeMetadata> {
    try {
      return await operation();
    } catch (error) {
      return {
        status: "failed",
        reason: "exception",
        error_message: error instanceof Error ? error.message : "费用流程运行同步失败",
      };
    }
  }

  private getNodeKey(node: JsonObject | null): string | null {
    const nodeKey = node?.node_key;
    return typeof nodeKey === "string" ? nodeKey : null;
  }
}

export const expenseWorkflowRuntimeService = new ExpenseWorkflowRuntimeService();
