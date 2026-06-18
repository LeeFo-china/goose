import {
  workflowTaskRepository,
  type WorkflowTaskWithInstanceRow,
} from "@/repositories/workflow-tasks";
import {
  buildWorkflowTaskActionsForTask,
  type WorkflowTaskActionPayload,
} from "@/services/workflow-task-actions";
import type { WorkflowSubjectType } from "@gooes/domain";
import {
  accessPolicyService,
  encodeQueryValue,
  getPriorityLabel,
  type AuthContext,
  type TaskCenterTodoItem,
} from "./shared";

const WORKFLOW_TASK_CENTER_PAGE_SIZE = 100;
const TASK_CENTER_WORKFLOW_SUBJECT_TYPES = ["project", "customer"] as const;

type TaskCenterWorkflowSubjectType =
  (typeof TASK_CENTER_WORKFLOW_SUBJECT_TYPES)[number];

export async function buildWorkflowTaskTodos(
  authContext: AuthContext,
): Promise<TaskCenterTodoItem[]> {
  if (!authContext.employeeId) {
    return [] as TaskCenterTodoItem[];
  }

  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const permissionCodes = authContext.permissions.map((item) => item.code);
  const taskPages = await Promise.all(
    TASK_CENTER_WORKFLOW_SUBJECT_TYPES.map((subjectType) =>
      workflowTaskRepository.listAccessibleTasks({
        tenantId,
        employeeId: authContext.employeeId,
        roleCodes: authContext.roleCodes,
        permissionCodes,
        subjectType,
        status: "pending",
        page: 1,
        pageSize: WORKFLOW_TASK_CENTER_PAGE_SIZE,
      })
    ),
  );

  const todoItems = await Promise.all(
    taskPages
      .flatMap((page) => page.list)
      .map((task) => buildWorkflowTaskTodoItem({ tenantId, task })),
  );

  return todoItems.filter((item): item is TaskCenterTodoItem => Boolean(item));
}

async function buildWorkflowTaskTodoItem(input: {
  tenantId: string;
  task: WorkflowTaskWithInstanceRow;
}): Promise<TaskCenterTodoItem | null> {
  const subjectType = getTaskCenterWorkflowSubjectType(
    input.task.instance?.subject_type,
  );
  const subjectId = input.task.instance?.subject_id;
  if (!subjectType || !subjectId) return null;

  const actions = await buildWorkflowTaskActionsForTask({
    tenantId: input.tenantId,
    subjectType,
    task: input.task,
  });
  if (actions.length === 0) return null;

  const action = resolvePrimaryWorkflowAction(actions);
  if (!action) return null;
  const todoType = resolveWorkflowTodoType(subjectType, action);
  const priority = isPaymentCollectionAction(action) ? "high" : "medium";

  return {
    id: `workflow_task:${input.task.id}`,
    type: todoType,
    title: input.task.title || action.label || "流程待处理",
    subtitle: buildWorkflowTodoSubtitle(subjectType, action),
    status: "pending",
    status_label: "待处理",
    priority,
    priority_label: getPriorityLabel(priority),
    due_at: input.task.due_at || input.task.updated_at,
    created_at: input.task.created_at,
    action_label: getWorkflowTodoActionLabel(action),
    target_url: buildWorkflowTodoTargetUrl({
      subjectType,
      subjectId,
      taskId: input.task.id,
      action,
    }),
    target_type: subjectType,
    target_id: subjectId,
    metadata: {
      workflow_task_id: input.task.id,
      workflow_instance_id: input.task.instance_id,
      workflow_node_key: input.task.node_key,
      workflow_node_type: input.task.node_type,
      workflow_action_key: action.key,
      workflow_business_domain: action.business_domain,
      workflow_business_action: action.business_action,
      workflow_actions: actions,
    },
  };
}

function getTaskCenterWorkflowSubjectType(
  value: WorkflowSubjectType | null | undefined,
): TaskCenterWorkflowSubjectType | null {
  return TASK_CENTER_WORKFLOW_SUBJECT_TYPES.includes(
      value as TaskCenterWorkflowSubjectType,
    )
    ? value as TaskCenterWorkflowSubjectType
    : null;
}

function resolvePrimaryWorkflowAction(
  actions: WorkflowTaskActionPayload[],
): WorkflowTaskActionPayload | null {
  return actions.find(isPaymentCollectionAction) ?? actions[0] ?? null;
}

function resolveWorkflowTodoType(
  subjectType: TaskCenterWorkflowSubjectType,
  action: WorkflowTaskActionPayload,
): TaskCenterTodoItem["type"] {
  if (subjectType === "customer") return "customer_followup";
  if (isPaymentCollectionAction(action)) return "project_payment";
  return "project_workflow";
}

function buildWorkflowTodoSubtitle(
  subjectType: TaskCenterWorkflowSubjectType,
  action: WorkflowTaskActionPayload,
) {
  if (isPaymentCollectionAction(action)) return "请进入项目详情确认收款";
  return subjectType === "customer"
    ? "请进入客户详情处理当前流程"
    : "请进入项目详情处理当前流程";
}

function getWorkflowTodoActionLabel(action: WorkflowTaskActionPayload) {
  return isPaymentCollectionAction(action) ? "确认收款" : action.label || "去处理";
}

function buildWorkflowTodoTargetUrl(input: {
  subjectType: TaskCenterWorkflowSubjectType;
  subjectId: string;
  taskId: string;
  action: WorkflowTaskActionPayload;
}) {
  const subjectId = encodeQueryValue(input.subjectId);
  if (input.subjectType === "customer") {
    return `/packageCustomers/pages/customerDetail/index?id=${subjectId}`;
  }

  if (isPaymentCollectionAction(input.action)) {
    return [
      "/packageProjects/pages/detail/index",
      `?id=${subjectId}`,
      `&workflowTaskId=${encodeQueryValue(input.taskId)}`,
      "&action=confirm_payment",
    ].join("");
  }

  return `/packageProjects/pages/detail/index?id=${subjectId}`;
}

function isPaymentCollectionAction(action: WorkflowTaskActionPayload) {
  return action.business_domain === "payment_collection" ||
    action.output_fields.some((field) => field.type === "payment_collection");
}
