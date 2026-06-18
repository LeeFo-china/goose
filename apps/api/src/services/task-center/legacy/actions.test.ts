import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "../../authorization";

const emptyTaskPage = {
  list: [],
  pagination: {
    page: 1,
    pageSize: 100,
    total: 0,
    totalPages: 0,
  },
};

const projectPaymentTask = {
  id: "task-payment-1",
  tenant_id: "tenant-1",
  instance_id: "instance-payment-1",
  instance_node_id: "instance-node-payment-1",
  definition_id: "definition-1",
  version_id: "version-1",
  node_id: "node-payment-1",
  node_key: "payment_stage_2",
  node_type: "confirmation",
  title: "中期进度款",
  status: "pending",
  assignee_employee_id: "finance-1",
  assignee_role_code: null,
  assignee_permission_code: "finance.payment.confirm",
  assignee_employee: null,
  due_at: "2026-06-18T08:00:00.000Z",
  completed_by: null,
  completed_at: null,
  created_at: "2026-06-18T07:00:00.000Z",
  updated_at: "2026-06-18T07:30:00.000Z",
  instance: {
    id: "instance-payment-1",
    subject_type: "project",
    subject_id: "project-1",
    status: "running",
    current_node_key: "payment_stage_2",
    current_node_snapshot: {
      node_key: "payment_stage_2",
      business_kind: "payment_collection",
      title: "中期进度款",
      config: {
        payment_type: "stage_2",
      },
    },
  },
};

const projectWorkflowTask = {
  ...projectPaymentTask,
  id: "task-workflow-1",
  instance_id: "instance-workflow-1",
  instance_node_id: "instance-node-workflow-1",
  node_id: "node-workflow-1",
  node_key: "design_finalized",
  node_type: "business",
  title: "排期开工",
  assignee_employee_id: "manager-1",
  assignee_permission_code: null,
  due_at: null,
  instance: {
    id: "instance-workflow-1",
    subject_type: "project",
    subject_id: "project-2",
    status: "running",
    current_node_key: "design_finalized",
    current_node_snapshot: {
      node_key: "design_finalized",
      business_kind: "project_status",
      title: "排期开工",
      config: {},
    },
  },
};

const listAccessibleTasks = mock(async (input: { subjectType?: string }) => {
  if (input.subjectType === "project") {
    return {
      list: [projectPaymentTask, projectWorkflowTask],
      pagination: {
        page: 1,
        pageSize: 100,
        total: 2,
        totalPages: 1,
      },
    };
  }

  return emptyTaskPage;
});

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    listAccessibleTasks,
  },
}));

mock.module("@/repositories/task-center", () => ({
  taskCenterRepository: {
    listOwnedCustomerIds: mock(async () => []),
    listCustomerFollowUpsByCustomerIds: mock(async () => []),
    listOwnedActiveProjects: mock(async () => []),
    listTodayProjectLogs: mock(async () => []),
    listExpenseRequestsByIds: mock(async () => []),
    listProjectAcceptanceTodos: mock(async () => []),
    listCustomerServiceTicketTodos: mock(async () => []),
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId: mock((authContext: { tenantId?: string | null }) => {
      if (!authContext.tenantId) throw new Error("missing tenant");
      return authContext.tenantId;
    }),
    assertTenantContext: mock((authContext: { tenantId?: string | null }) => {
      if (!authContext.tenantId) throw new Error("missing tenant");
      return authContext.tenantId;
    }),
    getScope: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) =>
      authContext.permissions?.find((permission) =>
        permission.code === permissionCode
      )?.scope ?? null
    ),
    hasPermission: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) =>
      authContext.permissions?.some((permission) =>
        permission.code === permissionCode
      ) ?? false
    ),
  },
}));

const authContext: AuthContext = {
  authUserId: "auth-1",
  employeeId: "finance-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "finance.payment.confirm", scope: "all" }],
};

describe("TaskCenterTodoListQuerySchema", () => {
  test("accepts workflow task-center project filters used by mini program", async () => {
    const { TaskCenterTodoListQuerySchema } = await import("../../../schema/task-center");

    expect(TaskCenterTodoListQuerySchema.safeParse({
      type: "project_payment",
      page: "1",
      pageSize: "20",
    }).success).toBe(true);
    expect(TaskCenterTodoListQuerySchema.safeParse({
      type: "project_workflow",
      page: "1",
      pageSize: "20",
    }).success).toBe(true);
  });
});

describe("taskCenterService workflow todos", () => {
  test("maps project payment workflow tasks to mini program payment todos", async () => {
    const { taskCenterService } = await import("../../task-center");

    const result = await taskCenterService.listTodos(authContext, {
      page: 1,
      pageSize: 20,
      status: "pending",
      type: "project_payment",
    });

    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      id: "workflow_task:task-payment-1",
      type: "project_payment",
      title: "中期进度款",
      action_label: "确认收款",
      target_type: "project",
      target_id: "project-1",
      target_url:
        "/packageProjects/pages/detail/index?id=project-1&workflowTaskId=task-payment-1&action=confirm_payment",
      metadata: {
        workflow_task_id: "task-payment-1",
        workflow_instance_id: "instance-payment-1",
        workflow_node_key: "payment_stage_2",
        workflow_business_domain: "payment_collection",
        workflow_business_action: "confirm_payment",
      },
    });
  });

  test("maps non-payment project workflow tasks to project workflow todos", async () => {
    const { taskCenterService } = await import("../../task-center");

    const result = await taskCenterService.listTodos(authContext, {
      page: 1,
      pageSize: 20,
      status: "pending",
      type: "project_workflow",
    });

    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toMatchObject({
      id: "workflow_task:task-workflow-1",
      type: "project_workflow",
      title: "排期开工",
      action_label: "去处理",
      target_type: "project",
      target_id: "project-2",
      target_url: "/packageProjects/pages/detail/index?id=project-2",
      metadata: {
        workflow_task_id: "task-workflow-1",
        workflow_instance_id: "instance-workflow-1",
        workflow_node_key: "design_finalized",
        workflow_business_domain: "workflow_project",
        workflow_business_action: "design_finalized",
      },
    });
  });
});
