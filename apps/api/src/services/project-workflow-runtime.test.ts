import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

type RuntimeInstanceFixture = {
  id: string;
  current_node_key: string | null;
};

type RuntimeInstanceListFixture = {
  list: RuntimeInstanceFixture[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type StartRuntimeInstanceFixture = {
  ok: true;
  instance: RuntimeInstanceFixture;
  currentNode: Record<string, unknown>;
  task: null;
};

type CompleteRuntimeNodeFixture = {
  ok: true;
  instance: RuntimeInstanceFixture;
  completedNode: Record<string, unknown>;
  nextNode: { node_key: string } | null;
  task: null;
};

const findDefinitionByKey = mock(async (_tenantId: string, workflowKey: string) => workflowKey === "project_signing" ? ({
  id: "definition-1",
  tenant_id: "tenant-1",
  workflow_key: "project_signing",
  name: "项目签约主流程",
  description: null,
  category: "construction",
  status: "active",
  active_version_id: "version-1",
  created_by: null,
  updated_by: null,
  created_at: "2026-06-17T00:00:00.000Z",
  updated_at: "2026-06-17T00:00:00.000Z",
}) : workflowKey === "construction_main" ? ({
  id: "construction-definition-1",
  tenant_id: "tenant-1",
  workflow_key: "construction_main",
  name: "施工主流程",
  description: null,
  category: "construction",
  status: "active",
  active_version_id: "construction-version-1",
  created_by: null,
  updated_by: null,
  created_at: "2026-06-17T00:00:00.000Z",
  updated_at: "2026-06-17T00:00:00.000Z",
}) : null);
const getDefinitionById = mock(async (
  _id: string,
  _tenantId: string,
): Promise<unknown> => null);
const findDefaultProjectConstructionWorkflow = mock(async (_tenantId: string) => null);
const listRuntimeInstances = mock(async (
  _input?: { definitionId: string },
): Promise<RuntimeInstanceListFixture> => ({
  list: [],
  pagination: {
    page: 1,
    pageSize: 1,
    total: 0,
    totalPages: 0,
  },
}));
const startRuntimeInstance = mock(async (): Promise<StartRuntimeInstanceFixture> => ({
  ok: true,
  instance: {
    id: "instance-1",
    current_node_key: "designing",
  },
  currentNode: {},
  task: null,
}));
const completeRuntimeNode = mock(async (): Promise<CompleteRuntimeNodeFixture> => ({
  ok: true,
  instance: {
    id: "instance-1",
    current_node_key: "proposal_confirmed",
  },
  completedNode: {},
  nextNode: {
    node_key: "proposal_confirmed",
  },
  task: null,
}));
const syncFromRuntimeInstance = mock(async () => null);
const getRuntimeInstanceById = mock(async () => ({
  status: "completed",
  current_node_key: "pending_start",
  current_node_id: "node-1",
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getRuntimeInstanceById,
    findDefinitionByKey,
    getDefinitionById,
    findDefaultProjectConstructionWorkflow,
    listRuntimeInstances,
    startRuntimeInstance,
    completeRuntimeNode,
  },
}));

const findProjectById = mock(async (
  _projectId: string,
  _tenantId: string,
): Promise<unknown> => null);

mock.module("@/repositories/projects", () => ({
  projectRepository: {
    findById: findProjectById,
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance,
  },
}));

function buildAuthContext(): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "业务员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: "department-1",
    departmentCode: "MARKETING",
    departmentName: "市场部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: [],
  };
}

beforeEach(() => {
  findDefinitionByKey.mockClear();
  getDefinitionById.mockClear();
  getDefinitionById.mockImplementation(async () => null);
  findDefaultProjectConstructionWorkflow.mockClear();
  findDefaultProjectConstructionWorkflow.mockImplementation(async () => null);
  listRuntimeInstances.mockClear();
  listRuntimeInstances.mockImplementation(async () => ({
    list: [],
    pagination: {
      page: 1,
      pageSize: 1,
      total: 0,
      totalPages: 0,
    },
  }));
  startRuntimeInstance.mockClear();
  completeRuntimeNode.mockClear();
  syncFromRuntimeInstance.mockClear();
  getRuntimeInstanceById.mockClear();
  findProjectById.mockClear();
  findProjectById.mockImplementation(async () => null);
});

describe("projectWorkflowRuntimeService", () => {
  test("starts project workflow runtime for a newly created design project", async () => {
    const { projectWorkflowRuntimeService } = await import(
      "./project-workflow-runtime"
    );

    const result = await projectWorkflowRuntimeService.syncProjectCreated({
      authContext: buildAuthContext(),
      tenantId: "tenant-1",
      projectId: "project-1",
      source: "customer_start_design",
      extraContext: {
        customer_id: "customer-1",
      },
    });

    expect(startRuntimeInstance).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      subjectType: "project",
      subjectId: "project-1",
      startedBy: "employee-1",
      context: expect.objectContaining({
        source: "customer_start_design",
        project_id: "project-1",
        customer_id: "customer-1",
        operator_employee_id: "employee-1",
        operator_auth_user_id: "auth-1",
      }),
    }));
    expect(completeRuntimeNode).not.toHaveBeenCalled();
    expect(syncFromRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
    });
    expect(result).toMatchObject({
      status: "started",
      workflow_key: "project_signing",
      definition_id: "definition-1",
      instance_id: "instance-1",
      current_node_key: "designing",
    });
  });

  test("starts construction workflow after project signing confirms start", async () => {
    listRuntimeInstances.mockImplementation(async (input?: { definitionId: string }) => ({
      list: input?.definitionId === "definition-1"
        ? [{
          id: "signing-instance-1",
          current_node_key: "pending_start",
        }]
        : [],
      pagination: {
        page: 1,
        pageSize: 1,
        total: input?.definitionId === "definition-1" ? 1 : 0,
        totalPages: input?.definitionId === "definition-1" ? 1 : 0,
      },
    }));
    completeRuntimeNode.mockImplementationOnce(async () => ({
      ok: true,
      instance: {
        id: "signing-instance-1",
        current_node_key: null,
      },
      completedNode: {},
      nextNode: null,
      task: null,
    }));
    startRuntimeInstance.mockImplementationOnce(async () => ({
      ok: true,
      instance: {
        id: "construction-instance-1",
        current_node_key: "started",
      },
      currentNode: {},
      task: null,
    }));
    const { projectWorkflowRuntimeService } = await import(
      "./project-workflow-runtime"
    );

    const result = await projectWorkflowRuntimeService.applyWorkflowEffect({
      authContext: buildAuthContext(),
      tenantId: "tenant-1",
      projectId: "project-1",
      fromStatus: "pending_start",
      toStatus: "started",
      action: "start_project",
    });

    expect(completeRuntimeNode).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: "definition-1",
      instanceId: "signing-instance-1",
      nodeKey: "pending_start",
      action: "start_project",
    }));
    expect(startRuntimeInstance).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: "construction-definition-1",
      subjectType: "project",
      subjectId: "project-1",
    }));
    expect(result).toMatchObject({
      status: "started",
      workflow_key: "construction_main",
      definition_id: "construction-definition-1",
      instance_id: "construction-instance-1",
      current_node_key: "started",
    });
  });

  test("starts the construction workflow selected on the project", async () => {
    findProjectById.mockImplementationOnce(async () => ({
      id: "project-1",
      construction_workflow_definition_id: "construction-definition-premium",
    }));
    getDefinitionById.mockImplementationOnce(async () => ({
      id: "construction-definition-premium",
      tenant_id: "tenant-1",
      workflow_key: "construction_premium",
      name: "精装施工流程",
      description: null,
      category: "construction",
      status: "active",
      active_version_id: "construction-version-premium",
      created_by: null,
      updated_by: null,
      created_at: "2026-06-17T00:00:00.000Z",
      updated_at: "2026-06-17T00:00:00.000Z",
    }));
    listRuntimeInstances.mockImplementation(async (input?: { definitionId: string }) => ({
      list: input?.definitionId === "definition-1"
        ? [{
          id: "signing-instance-1",
          current_node_key: "pending_start",
        }]
        : [],
      pagination: {
        page: 1,
        pageSize: 1,
        total: input?.definitionId === "definition-1" ? 1 : 0,
        totalPages: input?.definitionId === "definition-1" ? 1 : 0,
      },
    }));
    completeRuntimeNode.mockImplementationOnce(async () => ({
      ok: true,
      instance: {
        id: "signing-instance-1",
        current_node_key: null,
      },
      completedNode: {},
      nextNode: null,
      task: null,
    }));
    startRuntimeInstance.mockImplementationOnce(async () => ({
      ok: true,
      instance: {
        id: "construction-instance-premium",
        current_node_key: "started",
      },
      currentNode: {},
      task: null,
    }));
    const { projectWorkflowRuntimeService } = await import(
      "./project-workflow-runtime"
    );

    const result = await projectWorkflowRuntimeService.applyWorkflowEffect({
      authContext: buildAuthContext(),
      tenantId: "tenant-1",
      projectId: "project-1",
      fromStatus: "pending_start",
      toStatus: "started",
      action: "start_project",
    });

    expect(getDefinitionById).toHaveBeenCalledWith(
      "construction-definition-premium",
      "tenant-1",
    );
    expect(startRuntimeInstance).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: "construction-definition-premium",
      subjectType: "project",
      subjectId: "project-1",
    }));
    expect(result).toMatchObject({
      status: "started",
      workflow_key: "construction_premium",
      definition_id: "construction-definition-premium",
      instance_id: "construction-instance-premium",
      current_node_key: "started",
    });
  });

  test("uses final_acceptance node for construction acceptance runtime", async () => {
    findDefinitionByKey.mockImplementation(async (_tenantId: string, workflowKey: string) =>
      workflowKey === "construction_main"
        ? {
          id: "construction-definition-1",
          tenant_id: "tenant-1",
          workflow_key: "construction_main",
          name: "施工主流程",
          description: null,
          category: "construction",
          status: "active",
          active_version_id: "construction-version-1",
          created_by: null,
          updated_by: null,
          created_at: "2026-06-17T00:00:00.000Z",
          updated_at: "2026-06-17T00:00:00.000Z",
        }
        : null
    );
    listRuntimeInstances.mockImplementation(async () => ({
      list: [{
        id: "construction-instance-1",
        current_node_key: "final_acceptance",
      }],
      pagination: {
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      },
    }));
    const { projectWorkflowRuntimeService } = await import(
      "./project-workflow-runtime"
    );

    await projectWorkflowRuntimeService.applyWorkflowEffect({
      authContext: buildAuthContext(),
      tenantId: "tenant-1",
      projectId: "project-1",
      fromStatus: "constructing",
      toStatus: "acceptance",
      action: "start_acceptance",
    });

    expect(completeRuntimeNode).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: "construction-definition-1",
      instanceId: "construction-instance-1",
      nodeKey: "final_acceptance",
      action: "start_acceptance",
    }));
  });
});
