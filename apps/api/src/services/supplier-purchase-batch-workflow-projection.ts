import type { SupplierPurchaseBatchDetail } from
  "@/repositories/supplier-purchase-batch-records";
import type { Page } from "@/repositories/supplier-purchase-batches";
import {
  workflowTaskRepository,
  type WorkflowTaskActionRow,
} from "@/repositories/workflow-tasks";
import {
  workflowSubjectStateRepository,
  type WorkflowSubjectStateCompactRow,
} from "@/repositories/workflow-subject-states";
import type { AuthContext } from "@/services/authorization";
import {
  deriveSupplierPurchaseBatchActions,
} from "@/services/supplier-purchase-batch-access";
import {
  buildWorkflowTaskActionsForTask,
  type WorkflowTaskActionPayload,
} from "@/services/workflow-task-actions";
import { workflowSubjectsService } from "@/services/workflow-subjects";

export type SupplierPurchaseBatchWorkflowReadPort = {
  listSubjectStates(input: {
    tenantId: string;
    subjectType: "supplier_purchase_batch";
    subjectIds: string[];
  }): Promise<WorkflowSubjectStateCompactRow[]>;
  listAccessiblePendingTasks(input: {
    tenantId: string;
    subjectType: "supplier_purchase_batch";
    subjectIds: string[];
    employeeId: string;
    roleCodes: string[];
    permissionCodes: string[];
    limit: number;
  }): Promise<WorkflowTaskActionRow[]>;
  buildTaskActions(input: {
    tenantId: string;
    subjectType: "supplier_purchase_batch";
    task: WorkflowTaskActionRow;
  }): Promise<WorkflowTaskActionPayload[]>;
  getState(
    auth: AuthContext,
    params: {
      subjectType: "supplier_purchase_batch";
      subjectId: string;
    },
    options: { actionsPromise: Promise<WorkflowTaskActionPayload[]> },
  ): Promise<{ workflow_state: Record<string, unknown> | null }>;
};

export type SupplierPurchaseBatchWorkflowProjectionDependencies = {
  workflowRead?: SupplierPurchaseBatchWorkflowReadPort;
};

type ProjectionScope = {
  tenantId: string;
  employeeId: string;
};

export class SupplierPurchaseBatchWorkflowProjectionService {
  private readonly workflowRead: SupplierPurchaseBatchWorkflowReadPort;

  constructor(
    dependencies: SupplierPurchaseBatchWorkflowProjectionDependencies = {},
  ) {
    this.workflowRead = dependencies.workflowRead ?? {
      listSubjectStates: (input) =>
        workflowSubjectStateRepository.listCompactBySubjectIds(input),
      listAccessiblePendingTasks: (input) =>
        workflowTaskRepository.listAccessiblePendingBySubjectIds(input),
      buildTaskActions: (input) => buildWorkflowTaskActionsForTask(input),
      getState: (auth, params, options) =>
        workflowSubjectsService.getState(auth, params, options),
    };
  }

  async enrichPage(input: {
    auth: AuthContext;
    scope: ProjectionScope;
    page: Page<SupplierPurchaseBatchDetail>;
    updateProjectIds: string[] | null;
  }) {
    if (input.page.list.length === 0) return input.page;
    const subjectIds = input.page.list.map(({ id }) => id);
    const [states, actionsByBatchId] = await Promise.all([
      this.workflowRead.listSubjectStates({
        tenantId: input.scope.tenantId,
        subjectType: "supplier_purchase_batch",
        subjectIds,
      }),
      this.loadActions({
        auth: input.auth,
        scope: input.scope,
        batches: input.page.list,
      }),
    ]);
    const stateByBatchId = new Map(states.map((state) => [
      state.subject_id,
      compactWorkflowState(
        state,
        actionsByBatchId.get(state.subject_id) ?? [],
      ),
    ]));
    return {
      ...input.page,
      list: input.page.list.map((batch) => {
        const workflowState = stateByBatchId.get(batch.id) ?? null;
        const workflowActions = actionsByBatchId.get(batch.id) ?? [];
        return {
          ...batch,
          workflow_state: workflowState,
          actions: deriveWorkflowActions({
            auth: input.auth,
            scope: input.scope,
            batch,
            updateProjectIds: input.updateProjectIds,
            workflowActions,
            workflowState,
          }),
        };
      }),
    };
  }

  async enrichDetail(input: {
    auth: AuthContext;
    scope: ProjectionScope;
    batch: SupplierPurchaseBatchDetail;
    updateProjectIds: string[] | null;
  }) {
    const actionsByBatchId = await this.loadActions({
      auth: input.auth,
      scope: input.scope,
      batches: [input.batch],
    });
    const workflowActions = actionsByBatchId.get(input.batch.id) ?? [];
    const workflowState = (await this.workflowRead.getState(
      input.auth,
      {
        subjectType: "supplier_purchase_batch",
        subjectId: input.batch.id,
      },
      { actionsPromise: Promise.resolve(workflowActions) },
    )).workflow_state;
    return {
      ...input.batch,
      workflow_state: workflowState,
      actions: deriveWorkflowActions({
        auth: input.auth,
        scope: input.scope,
        batch: input.batch,
        updateProjectIds: input.updateProjectIds,
        workflowActions,
        workflowState,
      }),
    };
  }

  private async loadActions(input: {
    auth: AuthContext;
    scope: ProjectionScope;
    batches: SupplierPurchaseBatchDetail[];
  }): Promise<Map<string, WorkflowTaskActionPayload[]>> {
    const batchById = new Map(input.batches.map((batch) => [batch.id, batch]));
    const tasks = await this.workflowRead.listAccessiblePendingTasks({
      tenantId: input.scope.tenantId,
      subjectType: "supplier_purchase_batch",
      subjectIds: input.batches.map(({ id }) => id),
      employeeId: input.scope.employeeId,
      roleCodes: input.auth.roleCodes,
      permissionCodes: input.auth.permissions.map(({ code }) => code),
      limit: 100,
    });
    const actionsByBatchId = new Map<string, WorkflowTaskActionPayload[]>();
    await Promise.all(tasks.map(async (task) => {
      const subjectId = task.instance?.subject_id;
      const batch = subjectId ? batchById.get(subjectId) : undefined;
      if (!subjectId || !batch || !taskIsAccessible({
        auth: input.auth,
        task,
        createdByEmployeeId: batch.created_by_employee_id,
        submittedByEmployeeId: batch.submitted_by_employee_id,
      })) return;
      const actions = await this.workflowRead.buildTaskActions({
        tenantId: input.scope.tenantId,
        subjectType: "supplier_purchase_batch",
        task,
      });
      actionsByBatchId.set(subjectId, [
        ...(actionsByBatchId.get(subjectId) ?? []),
        ...actions,
      ]);
    }));
    return actionsByBatchId;
  }
}

function deriveWorkflowActions(input: {
  auth: AuthContext;
  scope: ProjectionScope;
  batch: SupplierPurchaseBatchDetail;
  updateProjectIds: string[] | null;
  workflowActions: WorkflowTaskActionPayload[];
  workflowState: unknown;
}) {
  return deriveSupplierPurchaseBatchActions({
    status: input.batch.status,
    createdByEmployeeId: input.batch.created_by_employee_id,
    submittedByEmployeeId: input.batch.submitted_by_employee_id,
    actorEmployeeId: input.scope.employeeId,
    permissions: input.auth.permissions.map(({ code }) => code),
    canReadProject: true,
    canUpdateProject: projectIsVisible(
      input.batch.project_id,
      input.updateProjectIds,
    ),
    workflowEnabled: true,
    workflowCanReview: input.workflowActions.length > 0,
    workflowCanWithdraw: stateAllowsWithdraw(input.workflowState),
  });
}

function compactWorkflowState(
  state: WorkflowSubjectStateCompactRow,
  actions: WorkflowTaskActionPayload[],
) {
  return {
    instance_id: state.instance_id,
    instance_status: state.instance_status,
    current_node_key: state.current_node_key,
    current_node_title: state.current_node_title,
    pending_task_count: state.pending_task_count,
    actions,
  };
}

function stateAllowsWithdraw(value: unknown): boolean {
  const state = asRecord(value);
  return state?.instance_status === "running" &&
    typeof state.pending_task_count === "number" &&
    state.pending_task_count > 0;
}

function taskIsAccessible(input: {
  auth: AuthContext;
  task: WorkflowTaskActionRow;
  createdByEmployeeId: string;
  submittedByEmployeeId: string | null;
}): boolean {
  const { auth, task } = input;
  if (!auth.employeeId || task.status !== "pending" ||
    task.instance?.subject_type !== "supplier_purchase_batch" ||
    task.instance.status !== "running" ||
    task.instance.current_node_key !== task.node_key ||
    auth.employeeId === input.createdByEmployeeId ||
    auth.employeeId === input.submittedByEmployeeId) return false;

  const permissionCodes = new Set(auth.permissions.map(({ code }) => code));
  if (requiredPermissions(task).some((code) => !permissionCodes.has(code))) {
    return false;
  }
  if (task.assignee_employee_id) {
    return task.assignee_employee_id === auth.employeeId;
  }
  return (!task.assignee_role_code ||
      auth.roleCodes.includes(task.assignee_role_code)) &&
    (!task.assignee_permission_code ||
      permissionCodes.has(task.assignee_permission_code));
}

function requiredPermissions(task: WorkflowTaskActionRow): string[] {
  const config = asRecord(asRecord(task.instance?.current_node_snapshot)?.config);
  const configured = Array.isArray(config?.required_permissions)
    ? config.required_permissions.filter((value): value is string =>
      typeof value === "string" && Boolean(value.trim())
    )
    : [];
  if (configured.length > 0) return Array.from(new Set(configured));
  if (task.assignee_permission_code) return [task.assignee_permission_code];
  if (task.node_key === "purchase_review") {
    return ["supplier.purchase-requisition.approve"];
  }
  if (task.node_key === "finance_review") return ["finance.budget.manage"];
  return [];
}

function projectIsVisible(
  projectId: string,
  visibleProjectIds: string[] | null,
): boolean {
  return visibleProjectIds === null || visibleProjectIds.includes(projectId);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export const supplierPurchaseBatchWorkflowProjectionService =
  new SupplierPurchaseBatchWorkflowProjectionService();
