import type {
  WorkflowTaskActionRow,
  WorkflowTaskWithInstanceRow,
} from "@/repositories/workflow-tasks";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments";
import { buildProcedureAssignmentTimelineActions } from "@/services/project-workflow-procedure-assignment-contract";
import type {
  WorkflowTimelineGraphNodeProjection,
  WorkflowTimelineNodeAction,
} from "@/services/project-workflow-timeline-contract";
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
  task: WorkflowTaskActionRow;
  receivablesService?: WorkflowReceivableContextProvider;
  procedureAssignment?: ProcedureAssignmentRow | null;
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

  const payloadActions = actions.map((action) => ({
    ...action,
    ...basePayload,
    disabled: false,
  }));

  return applyProcedureAssignmentActions({
    task: input.task,
    actions: payloadActions,
    procedureAssignment: input.procedureAssignment,
  });
}

async function buildReceivableContextForTask(input: {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  task: WorkflowTaskActionRow;
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

function applyProcedureAssignmentActions(input: {
  task: WorkflowTaskActionRow;
  actions: WorkflowTaskActionPayload[];
  procedureAssignment?: ProcedureAssignmentRow | null;
}): WorkflowTaskActionPayload[] {
  if (!input.procedureAssignment) return input.actions;
  if (input.task.instance?.subject_type !== "project") return input.actions;
  if (input.task.node_type !== "procedure") return input.actions;

  const snapshot = asRecord(input.task.instance.current_node_snapshot);
  const node: WorkflowTimelineGraphNodeProjection = {
    id: input.task.node_id,
    node_key: input.task.node_key,
    title: input.task.title,
    node_type: input.task.node_type,
    business_kind: readString(snapshot?.business_kind),
    config: asRecord(snapshot?.config) ?? {},
  };
  const timelineActions = input.actions as WorkflowTimelineNodeAction[];
  const enrichedActions = buildProcedureAssignmentTimelineActions({
    node,
    actions: timelineActions,
    procedureAssignment: input.procedureAssignment,
  });

  return enrichedActions.map((action): WorkflowTaskActionPayload => ({
    ...action,
    key: readString(action.key) ?? "complete",
    label: readString(action.label) ?? input.task.title,
    business_domain: readWorkflowTaskBusinessDomain(action.business_domain),
    business_action: readString(action.business_action),
    task_id: input.task.id,
    node_key: input.task.node_key,
    node_type: input.task.node_type,
    requires_reason: action.requires_reason === true,
    output_fields: Array.isArray(action.output_fields)
      ? action.output_fields as WorkflowTaskActionPayload["output_fields"]
      : [],
    disabled: action.disabled === true,
    disabled_reason: readString(action.disabled_reason) ?? undefined,
  }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readWorkflowTaskBusinessDomain(
  value: unknown,
): WorkflowTaskActionPayload["business_domain"] {
  if (
    value === "customer_status" ||
    value === "workflow_project" ||
    value === "project_procedure" ||
    value === "payment_collection" ||
    value === "expense_request"
  ) {
    return value;
  }

  return null;
}
