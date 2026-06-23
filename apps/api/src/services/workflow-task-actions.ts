import type {
  WorkflowTaskWithInstanceRow,
} from "@/repositories/workflow-tasks";
import {
  buildWorkflowTaskActions,
  type WorkflowTaskActionMetadata,
  type WorkflowReceivableActionContext,
} from "@/services/workflow-task-action-metadata";
import { buildWorkflowTaskAssigneeMetadata } from "@/services/workflow-task-assignee";
import type { WorkflowSubjectType } from "@gooes/domain";

export type WorkflowTaskActionPayload = WorkflowTaskActionMetadata & {
  task_id: string;
  node_key: string;
  node_type: string;
  disabled: boolean;
  disabled_reason?: string;
  blocked_reason?: string;
};

type WorkflowReceivableContextProvider = {
  ensureWorkflowPaymentReceivableContext: (input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string | null;
    workflowNodeKey: string;
    taskCreatedAt: string | null;
    nodeSnapshot: unknown;
  }) => Promise<WorkflowReceivableActionContext | null>;
};

export async function buildWorkflowTaskActionPayloads(input: {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  tasks: WorkflowTaskWithInstanceRow[];
  receivablesService?: WorkflowReceivableContextProvider;
}): Promise<WorkflowTaskActionPayload[]> {
  const actionGroups = await Promise.all(
    input.tasks.map((task) => buildWorkflowTaskActionsForTask({
      tenantId: input.tenantId,
      subjectType: input.subjectType,
      task,
      receivablesService: input.receivablesService,
    })),
  );

  return actionGroups.flat();
}

export async function buildWorkflowTaskActionsForTask(input: {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  task: WorkflowTaskWithInstanceRow;
  receivablesService?: WorkflowReceivableContextProvider;
}): Promise<WorkflowTaskActionPayload[]> {
  const receivableContext = await buildReceivableContextForTask(input);
  const actions = buildWorkflowTaskActions({
    subjectType: input.subjectType,
    nodeKey: input.task.node_key,
    nodeType: input.task.node_type,
    taskTitle: input.task.title,
    currentNodeSnapshot: input.task.instance?.current_node_snapshot,
    receivableContext,
  });
  const basePayload = {
    task_id: input.task.id,
    node_key: input.task.node_key,
    node_type: input.task.node_type,
    ...buildWorkflowTaskAssigneeMetadata(input.task),
  };

  return actions.map((action) => ({
    ...action,
    ...basePayload,
    disabled: false,
  }));
}

async function buildReceivableContextForTask(input: {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  task: WorkflowTaskWithInstanceRow;
  receivablesService?: WorkflowReceivableContextProvider;
}) {
  if (input.subjectType !== "project") return null;
  if (input.task.instance?.subject_type !== "project") return null;
  if (!isPaymentCollectionSnapshot(input.task.instance.current_node_snapshot)) {
    return null;
  }

  const receivablesService = input.receivablesService ??
    await loadProjectReceivablesService();
  return receivablesService.ensureWorkflowPaymentReceivableContext({
    tenantId: input.tenantId,
    projectId: input.task.instance.subject_id,
    workflowInstanceId: input.task.instance_id,
    workflowInstanceNodeId: input.task.instance_node_id,
    workflowNodeKey: input.task.node_key,
    taskCreatedAt: input.task.created_at,
    nodeSnapshot: input.task.instance.current_node_snapshot,
  });
}

async function loadProjectReceivablesService(): Promise<WorkflowReceivableContextProvider> {
  const { projectReceivablesService } = await import(
    "@/services/project-receivables"
  );
  return projectReceivablesService;
}

function isPaymentCollectionSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (value as { business_kind?: unknown }).business_kind ===
    "payment_collection";
}
