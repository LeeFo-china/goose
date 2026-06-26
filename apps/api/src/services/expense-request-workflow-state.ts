import {
  workflowTaskRepository,
  type WorkflowTaskWithInstanceRow,
} from "@/repositories/workflow-tasks";
import {
  workflowSubjectStateRepository,
  type WorkflowSubjectStateRow,
} from "@/repositories/workflow-subject-states";
import {
  buildWorkflowTaskAssigneeMetadata,
  type WorkflowTaskAssigneeMetadata,
} from "@/services/workflow-task-assignee";

type ExpenseWorkflowSubject = {
  id: string;
  status?: string | null;
  assignee_id?: string | null;
  assignee?: unknown;
  employee?: unknown;
};

export function attachExpenseWorkflowStatesFromRows<T extends ExpenseWorkflowSubject>(
  rows: T[],
  states: WorkflowSubjectStateRow[],
  pendingTasks: WorkflowTaskWithInstanceRow[] = [],
): Array<T & { workflow_state: WorkflowSubjectStateRow | null } & ExpenseWorkflowPresentation> {
  const stateByExpenseId = new Map(
    states.map((state) => [state.subject_id, state]),
  );
  const tasksByExpenseId = groupPendingTasksByExpenseId(pendingTasks);

  return rows.map((row) => ({
    ...row,
    ...buildExpenseWorkflowPresentation({
      row,
      state: stateByExpenseId.get(row.id) ?? null,
      pendingTasks: tasksByExpenseId.get(row.id) ?? [],
    }),
  }));
}

export async function attachExpenseWorkflowStates<T extends ExpenseWorkflowSubject>(
  rows: T[],
  tenantId: string,
): Promise<Array<T & { workflow_state: WorkflowSubjectStateRow | null } & ExpenseWorkflowPresentation>> {
  if (rows.length === 0) return [];

  const subjectIds = rows.map((row) => row.id);
  const [states, pendingTasks] = await Promise.all([
    workflowSubjectStateRepository.listBySubjectIds({
      tenantId,
      subjectType: "expense_request",
      subjectIds,
    }),
    workflowTaskRepository.listPendingBySubjectIds({
      tenantId,
      subjectType: "expense_request",
      subjectIds,
    }),
  ]);

  return attachExpenseWorkflowStatesFromRows(rows, states, pendingTasks);
}

export type ExpenseWorkflowPresentation = WorkflowTaskAssigneeMetadata & {
  workflow_state: WorkflowSubjectStateRow | null;
  current_handler_label: string;
  next_action_label: string;
};

function buildExpenseWorkflowPresentation<T extends ExpenseWorkflowSubject>(
  input: {
    row: T;
    state: WorkflowSubjectStateRow | null;
    pendingTasks: WorkflowTaskWithInstanceRow[];
  },
): ExpenseWorkflowPresentation {
  const task = selectCurrentPendingTask(input.state, input.pendingTasks);
  const metadata = task
    ? buildWorkflowTaskAssigneeMetadata(task)
    : buildWorkflowTaskAssigneeMetadata({
      node_key: input.state?.current_node_key,
      title: input.state?.current_node_title,
      assignee_employee_id: readString(input.row.assignee_id),
      assignee_employee: readEmployee(input.row.assignee),
      assignee_role_code: null,
      assignee_permission_code: null,
    });
  const closedLabel = resolveClosedExpenseLabel(input.row, input.state);
  const currentHandlerLabel = closedLabel ?? metadata.current_handler_label;

  return {
    workflow_state: input.state,
    ...metadata,
    current_handler_label: currentHandlerLabel,
    next_action_label: resolveNextActionLabel(input.row, input.state, currentHandlerLabel),
  };
}

function selectCurrentPendingTask(
  state: WorkflowSubjectStateRow | null,
  pendingTasks: WorkflowTaskWithInstanceRow[],
): WorkflowTaskWithInstanceRow | null {
  if (pendingTasks.length === 0) return null;
  if (!state?.current_node_key) return pendingTasks[0] ?? null;
  return pendingTasks.find((task) => task.node_key === state.current_node_key) ??
    pendingTasks[0] ?? null;
}

function groupPendingTasksByExpenseId(
  tasks: WorkflowTaskWithInstanceRow[],
): Map<string, WorkflowTaskWithInstanceRow[]> {
  const result = new Map<string, WorkflowTaskWithInstanceRow[]>();
  for (const task of tasks) {
    const subjectId = task.instance?.subject_id;
    if (!subjectId) continue;
    result.set(subjectId, [...(result.get(subjectId) ?? []), task]);
  }
  return result;
}

function resolveClosedExpenseLabel(
  row: ExpenseWorkflowSubject,
  state: WorkflowSubjectStateRow | null,
): string | null {
  const status = readString(row.status);
  const nodeKey = state?.current_node_key;

  if (status === "draft") return "等待申请人提交";
  if (status === "rejected") return "等待申请人修改";
  if (status === "cancelled" || nodeKey === "cancelled") return "流程已撤回";
  if (status === "paid" || nodeKey === "done") return "流程完成";
  return null;
}

function resolveNextActionLabel(
  row: ExpenseWorkflowSubject,
  state: WorkflowSubjectStateRow | null,
  currentHandlerLabel: string,
): string {
  const status = readString(row.status);
  const nodeKey = state?.current_node_key;

  if (status === "draft") return "提交后按工作流规则流转";
  if (status === "rejected") return "修改后按工作流规则重新提交";
  if (status === "cancelled" || nodeKey === "cancelled") {
    return "流程已撤回，无下一步";
  }
  if (status === "paid" || nodeKey === "done") return "流程已完成";
  return currentHandlerLabel;
}

function readEmployee(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    id: readString(value.id) ?? undefined,
    name: readString(value.name),
    avatar: readString(value.avatar),
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
