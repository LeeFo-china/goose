import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkflowSubjectStateRow } from "@/repositories/workflow-subject-states";
import type { AuthContext } from "@/services/authorization";

const NOW = "2026-06-19T00:00:00.000Z";

const listBySubjectIds = mock(async () => [subjectState()]);
const listLatestRuntimeInstancesBySubjectIds = mock(async () => {
  throw new Error("list mode should not load latest runtime instances");
});
const listAccessiblePendingByProjectIds = mock(async () => {
  throw new Error("list mode should not load workflow tasks");
});
const getGraph = mock(async () => {
  throw new Error("list mode should not load workflow graphs");
});
const listRuntimeInstanceNodesByInstanceIds = mock(async () => {
  throw new Error("list mode should not load runtime nodes");
});

mock.module("@/repositories/workflow-subject-states", () => ({
  workflowSubjectStateRepository: {
    listBySubjectIds,
    listLatestRuntimeInstancesBySubjectIds,
  },
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    listAccessiblePendingByProjectIds,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getGraph,
    listRuntimeInstanceNodesByInstanceIds,
  },
}));

describe("attachProjectWorkflowSummaries list mode", () => {
  beforeEach(() => {
    listBySubjectIds.mockClear();
    listBySubjectIds.mockImplementation(async () => [subjectState()]);
    listLatestRuntimeInstancesBySubjectIds.mockClear();
    listAccessiblePendingByProjectIds.mockClear();
    getGraph.mockClear();
    listRuntimeInstanceNodesByInstanceIds.mockClear();
  });

  test("attaches lightweight list summaries without loading task actions or workflow graphs", async () => {
    const { attachProjectWorkflowSummaries } = await import("./workflow-summary");
    const rows = [{
      id: "project-1",
      name: "测试项目",
      construction_workflow_definition: {
        id: "definition-1",
        name: "项目施工主流程",
      },
    }];

    const result = await attachProjectWorkflowSummaries({
      rows,
      tenantId: "tenant-1",
      authContext: authContext(),
      workflowSummaryMode: "list",
    });
    const item = result[0]!;
    const progress = item.workflow_progress as {
      workflow_title: string | null;
      current_node_title: string | null;
      actions: unknown[];
      timeline_nodes: unknown[];
    };
    const state = item.workflow_state as {
      workflow_title: string | null;
      current_node_title: string | null;
      actions: unknown[];
      timeline_nodes: unknown[];
    } | null;

    expect(progress.workflow_title).toBe("项目施工主流程");
    expect(progress.current_node_title).toBe("水电");
    expect(progress.actions).toEqual([]);
    expect(progress.timeline_nodes).toEqual([]);
    expect(state?.workflow_title).toBe("项目施工主流程");
    expect(state?.current_node_title).toBe("水电");
    expect(state?.actions).toEqual([]);
    expect(state?.timeline_nodes).toEqual([]);
    expect(listBySubjectIds).toHaveBeenCalledTimes(1);
    expect(listLatestRuntimeInstancesBySubjectIds).not.toHaveBeenCalled();
    expect(listAccessiblePendingByProjectIds).not.toHaveBeenCalled();
    expect(listRuntimeInstanceNodesByInstanceIds).not.toHaveBeenCalled();
    expect(getGraph).not.toHaveBeenCalled();
  });

  test("uses workflow definition summary when the project relation is missing", async () => {
    const { attachProjectWorkflowSummaries } = await import("./workflow-summary");

    const result = await attachProjectWorkflowSummaries({
      rows: [{ id: "project-1", name: "历史项目" }],
      tenantId: "tenant-1",
      authContext: authContext(),
      workflowSummaryMode: "list",
    });
    const progress = result[0]!.workflow_progress as {
      workflow_title: string | null;
    };

    expect(progress.workflow_title).toBe("项目施工主流程");
    expect(getGraph).not.toHaveBeenCalled();
  });
});

function authContext(): AuthContext {
  return {
    authUserId: "auth-user-1",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantName: "测试租户",
    tenantSlug: "test",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "测试员工",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["finance"],
    roles: [],
    permissions: [{ code: "project.read", scope: "all" }],
  };
}

function subjectState(): WorkflowSubjectStateRow {
  return {
    id: "state-1",
    tenant_id: "tenant-1",
    subject_type: "project",
    subject_id: "project-1",
    definition_id: "definition-1",
    instance_id: "instance-1",
    instance_status: "running",
    current_node_key: "procedure_plumbing_electrical",
    current_node_title: "水电",
    current_business_kind: "procedure_template",
    pending_task_count: 1,
    created_at: NOW,
    updated_at: NOW,
    definition: {
      id: "definition-1",
      name: "项目施工主流程",
    },
  };
}
