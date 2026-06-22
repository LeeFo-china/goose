import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const findById = mock(async () => ({
  id: "project-1",
  tenant_id: "tenant-1",
  customer_id: "customer-1",
  status: "constructing",
}));
const updateIfStatus = mock(async () => ({
  id: "project-1",
  tenant_id: "tenant-1",
  customer_id: "customer-1",
  status: "acceptance",
}));
const assertProjectReadyForAcceptance = mock(async () => {
  throw new Error("项目进入竣工验收前，必须先完成拆改验收");
});
const listProjectConstructionStagesForProject = mock(async () => ({
  required_completed: true,
  missing_required_stages: [],
}));
const applyWorkflowEffectAndSubjectState = mock(async () => undefined);

mock.module("@/repositories/projects", () => ({
  projectRepository: {
    findById,
    updateIfStatus,
  },
}));

mock.module("@/repositories/customer-core", () => ({
  customerCoreRepository: {
    findById: mock(async () => null),
    update: mock(async () => undefined),
  },
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    listTransitionLogs: mock(async () => ({ list: [] })),
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock(() => "tenant-1"),
    canAccessProject: mock(async () => true),
  },
}));

mock.module("@/services/construction-stage-status", () => ({
  constructionStageStatusService: {
    assertProjectReadyForAcceptance,
    listProjectConstructionStagesForProject,
  },
}));

mock.module("@/services/project-members", () => ({
  projectMemberService: {
    assertEmployeeCanServeRole: mock(async () => undefined),
    setPrimaryRoleMember: mock(async () => undefined),
  },
}));

mock.module("@/services/project-workflow-runtime", () => ({
  projectWorkflowRuntimeService: {
    applyWorkflowEffectAndSubjectState,
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    getSubjectState: mock(async () => null),
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

describe("projectStatusService", () => {
  test("uses the latest workflow pause output as resume target", async () => {
    const { resolvePausedFromStatusFromWorkflowLogs } = await import(
      "./project-status"
    );

    expect(resolvePausedFromStatusFromWorkflowLogs([
      {
        action: "approve",
        target_node_key: "constructing",
        context: { paused_from_status: "constructing" },
      },
      {
        action: "pause_project",
        target_node_key: "on_hold",
        context: { paused_from_status: "constructing" },
      },
      {
        action: "pause_project",
        target_node_key: "on_hold",
        context: { paused_from_status: "started" },
      },
    ])).toBe("constructing");
  });

  test("ignores invalid workflow pause output", async () => {
    const { resolvePausedFromStatusFromWorkflowLogs } = await import(
      "./project-status"
    );

    expect(resolvePausedFromStatusFromWorkflowLogs([
      {
        action: "pause_project",
        target_node_key: "on_hold",
        context: { paused_from_status: "on_hold" },
      },
      {
        action: "pause_project",
        target_node_key: "on_hold",
        context: { paused_from_status: "unknown" },
      },
    ])).toBeNull();
  });

  test("uses workflow-aware required acceptance check when starting final acceptance", async () => {
    const { projectStatusService } = await import("./project-status");

    await expect(projectStatusService.applyWorkflowEffect({
      authContext,
      projectId: "project-1",
      payload: {
        action: "start_acceptance",
      },
    })).resolves.toEqual(expect.objectContaining({
      status: "acceptance",
    }));

    expect(listProjectConstructionStagesForProject).toHaveBeenCalledWith({
      projectId: "project-1",
      tenantId: "tenant-1",
      canReadAcceptance: true,
      canCreateAcceptance: false,
    });
    expect(assertProjectReadyForAcceptance).not.toHaveBeenCalled();
  });
});
