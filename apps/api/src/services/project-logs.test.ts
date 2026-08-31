import { describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import type { AuthContext } from "@/services/authorization";
import type { ProjectWorkflowProgress } from "@/services/project-workflow-progress";

const findProjectById = mock(async () => ({
  id: "550e8400-e29b-41d4-a716-446655440001",
  tenant_id: "tenant-1",
  status: "constructing",
}));
const findById = mock(async () => ({
  id: "log-1",
  project_id: "550e8400-e29b-41d4-a716-446655440001",
  tenant_id: "tenant-1",
  employee_id: "employee-1",
  stage_code: "tiling",
  content: "木工节点施工日志",
  images: [],
}));
const createFast = mock(async () => {
  throw new AppError(
    400,
    "请先完成水电后再进入瓦工",
    "PROJECT_LOG_STAGE_BLOCKED",
  );
});
const create = mock(async (payload: Record<string, unknown>) => ({
  id: "log-1",
  ...payload,
  employee: {
    id: "employee-1",
    name: "工程负责人",
    avatar: null,
  },
}));
const update = mock(async (input: { payload: Record<string, unknown> }) => ({
  id: "log-1",
  project_id: "550e8400-e29b-41d4-a716-446655440001",
  tenant_id: "tenant-1",
  employee_id: "employee-1",
  content: "木工节点施工日志",
  images: [],
  ...input.payload,
}));
const listBootstrapByProject = mock(async () => ({
  rows: Array.from({ length: 5 }, (_, index) => ({
    id: `log-${index + 1}`,
    project_id: "550e8400-e29b-41d4-a716-446655440001",
    tenant_id: "tenant-1",
    content: `施工日志 ${index + 1}`,
    images: [],
  })),
  hasMore: true,
  total: 28,
}));
const currentWorkflowProgress = {
  source: "workflow_runtime",
  instance_id: "instance-1",
  instance_status: "running",
  current_node_key: "procedure_tiling",
  current_node_title: "瓦工铺贴",
  current_group_key: "construction",
  current_group_label: "施工阶段",
  current_group_order: 20,
  current_node_type: "procedure",
  current_business_kind: "procedure_template",
  current_stage_code: "tiling",
  current_gate: null,
  timeline_nodes: [{
    node_key: "procedure_tiling",
    node_title: "瓦工铺贴",
    node_type: "procedure",
    business_kind: "procedure_template",
    group: { key: "construction", label: "施工阶段", order: 20 },
    status: "current",
    display: {
      label: "瓦工铺贴",
      status_label: "当前",
      status_variant: "default",
    },
    attributes: { stage_code: "tiling" },
    actions: [],
  }],
  pending_task_count: 1,
  actions: [],
  warnings: [],
} satisfies ProjectWorkflowProgress;
const assertProjectWorkflowStageMutationAllowed = mock(
  async () => currentWorkflowProgress,
);
const assertCanCreateProjectLog = mock(async () => undefined);

mock.module("@/repositories/project-logs", () => ({
  projectLogRepository: {
    findProjectById,
    findById,
    createFast,
    create,
    update,
    listBootstrapByProject,
  },
}));

mock.module("@/repositories/project-log-comments", () => ({
  projectLogCommentsRepository: {},
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock(() => "tenant-1"),
    assertTenantId: mock(() => "tenant-1"),
    assertPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.find((item) => item.code === permissionCode)
        ?.scope ?? "all"
    ),
    hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.some((item) => item.code === permissionCode)
    ),
    matchesTenant: mock(() => true),
    canWriteProjectLogForProject: mock(async () => true),
    canWriteProjectLog: mock(async () => true),
    canAccessProject: mock(async () => true),
    getScope: mock(() => "self"),
  },
}));

mock.module("@/services/project-workflow-mutation-guards", () => ({
  assertProjectWorkflowStageMutationAllowed,
}));

mock.module("@/services/project-procedure-assignments", () => ({
  projectProcedureAssignmentService: {
    assertCanCreateProjectLog,
  },
}));

mock.module("@/services/project-status", () => ({
  projectStatusService: {
    assertCanCreateProjectLog: mock(() => undefined),
  },
}));

mock.module("@/services/projects", () => ({
  projectSer: {
    invalidatePublicProjectLogsCache: mock(() => undefined),
  },
}));

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "工程负责人",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "ENGINEERING",
  departmentName: "工程部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "project_log.create", scope: "self" }],
} satisfies AuthContext;

describe("projectLogService", () => {
  test("uses workflow-approved direct insert for current construction stage logs", async () => {
    const { projectLogService } = await import("./project-logs");

    const result = await projectLogService.createProjectLog({
      authContext,
      payload: {
        project_id: "550e8400-e29b-41d4-a716-446655440001",
        stage_code: "tiling",
        node_name: "瓦工施工",
        content: "瓦工节点施工日志",
        images: ["project-log/tiling-a.jpg"],
      },
    });

    expect(result.row).toEqual(expect.objectContaining({
      id: "log-1",
      tenant_id: "tenant-1",
      employee_id: "employee-1",
      stage_code: "tiling",
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "550e8400-e29b-41d4-a716-446655440001",
      tenant_id: "tenant-1",
      employee_id: "employee-1",
      stage_code: "tiling",
    }));
    expect(assertCanCreateProjectLog).toHaveBeenCalledWith({
      authContext,
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      stageCode: "tiling",
    });
    expect(createFast).not.toHaveBeenCalled();
  });

  test("snapshots the current workflow process when node name is omitted", async () => {
    const { projectLogService } = await import("./project-logs");

    await projectLogService.createProjectLog({
      authContext,
      payload: {
        project_id: "550e8400-e29b-41d4-a716-446655440001",
        stage_code: "tiling",
        node_name: null,
        content: "瓦工节点施工日志",
        images: ["project-log/tiling-b.jpg"],
      },
    });

    expect(create.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      stage_code: "tiling",
      node_name: "瓦工铺贴",
    }));
  });

  test("uses workflow runtime guard when updating a construction log stage", async () => {
    const { projectLogService } = await import("./project-logs");

    const result = await projectLogService.updateProjectLog({
      authContext,
      id: "log-1",
      payload: {
        stage_code: "woodwork",
      },
    });

    expect(assertProjectWorkflowStageMutationAllowed).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      stageCode: "woodwork",
      mutation: "create_project_log",
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      id: "log-1",
      tenantId: "tenant-1",
      payload: expect.objectContaining({
        stage_code: "woodwork",
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      id: "log-1",
      stage_code: "woodwork",
    }));
  });

  test("uses exact total when building bootstrap project log pagination", async () => {
    const { projectLogService } = await import("./project-logs");

    const result = await projectLogService.listProjectLogBootstrapByProject({
      authContext,
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      pageSize: 5,
    });

    expect(listBootstrapByProject).toHaveBeenCalledWith({
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      tenantId: "tenant-1",
      from: 0,
      limit: 5,
    });
    expect(result.rows).toHaveLength(5);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 5,
      total: 28,
      totalPages: 6,
    });
  });
});
