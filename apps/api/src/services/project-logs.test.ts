import { describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import type { AuthContext } from "@/services/authorization";

const findProjectById = mock(async () => ({
  id: "550e8400-e29b-41d4-a716-446655440001",
  tenant_id: "tenant-1",
  status: "constructing",
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

mock.module("@/repositories/project-logs", () => ({
  projectLogRepository: {
    findProjectById,
    createFast,
    create,
  },
}));

mock.module("@/repositories/project-log-comments", () => ({
  projectLogCommentsRepository: {},
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock(() => "tenant-1"),
    canWriteProjectLogForProject: mock(async () => true),
    getScope: mock(() => "self"),
  },
}));

mock.module("@/services/project-workflow-mutation-guards", () => ({
  assertProjectWorkflowStageMutationAllowed: mock(async () => undefined),
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
  permissions: [],
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
    expect(createFast).not.toHaveBeenCalled();
  });
});
