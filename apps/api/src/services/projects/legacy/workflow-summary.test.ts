import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  WorkflowRuntimeProjectionRow,
  WorkflowSubjectStateRow,
} from "@/repositories/workflow-subject-states";
import type { WorkflowTaskWithInstanceRow } from "@/repositories/workflow-tasks";
import type {
  WorkflowGraphResult,
  WorkflowInstanceNodeRow,
  WorkflowNodeRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";

const NOW = "2026-06-19T00:00:00.000Z";

const listBySubjectIds = mock(async () => [subjectState()]);
const listLatestRuntimeInstancesBySubjectIds = mock(async () => [
  runtimeInstance(),
]);
const listAccessiblePendingByProjectIds = mock(async () => [pendingTask()]);
const getGraph = mock(async () => graph());
const listRuntimeInstanceNodesByInstanceIds = mock(async () => [
  completedNode("node-demolition", "procedure_demolition"),
]);

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

describe("attachProjectWorkflowSummaries", () => {
  beforeEach(() => {
    listBySubjectIds.mockClear();
    listBySubjectIds.mockImplementation(async () => [subjectState()]);
    listLatestRuntimeInstancesBySubjectIds.mockClear();
    listLatestRuntimeInstancesBySubjectIds.mockImplementation(async () => [
      runtimeInstance(),
    ]);
    listAccessiblePendingByProjectIds.mockClear();
    listAccessiblePendingByProjectIds.mockImplementation(async () => [
      pendingTask(),
    ]);
    getGraph.mockClear();
    getGraph.mockImplementation(async () => graph());
    listRuntimeInstanceNodesByInstanceIds.mockClear();
    listRuntimeInstanceNodesByInstanceIds.mockImplementation(async () => [
      completedNode("node-demolition", "procedure_demolition"),
    ]);
  });

  test("attaches workflow v2 summary from runtime instead of legacy stage fields", async () => {
    const { attachProjectWorkflowSummaries } = await import("./workflow-summary");
    const rows = [{
      id: "project-1",
      name: "测试项目",
      current_stage: "demolition",
      current_stage_label: "拆改",
      stage_code: "demolition",
      stage_label: "拆改",
    }];

    const result = await attachProjectWorkflowSummaries({
      rows,
      tenantId: "tenant-1",
      authContext: authContext(),
    });
    const item = result[0]!;

    expect(item.workflow_progress).toMatchObject({
      source: "workflow_runtime",
      instance_id: "instance-1",
      current_node_key: "procedure_plumbing_electrical",
      current_node_title: "水电",
      current_stage_code: "plumbing_electrical",
    });
    expect(item.workflow_state).toMatchObject({
      subject_type: "project",
      subject_id: "project-1",
      instance_id: "instance-1",
      current_node_key: "procedure_plumbing_electrical",
      current_node_title: "水电",
    });
    expect(item).not.toHaveProperty("current_stage");
    expect(item).not.toHaveProperty("current_stage_label");
    expect(item).not.toHaveProperty("stage_code");
    expect(item).not.toHaveProperty("stage_label");
    expect(
      (item.workflow_progress as { timeline_nodes: Array<Record<string, unknown>> })
        .timeline_nodes,
    ).toMatchObject([
      {
        node_key: "procedure_demolition",
        display: { label: "拆改", status_label: "已完成" },
        attributes: { stage_code: "demolition", acceptance_enabled: false },
      },
      {
        node_key: "procedure_plumbing_electrical",
        status: "current",
        display: { label: "水电", status_label: "当前" },
        attributes: {
          stage_code: "plumbing_electrical",
          acceptance_enabled: true,
          min_image_count: 3,
        },
        actions: [{ key: "complete", task_id: "task-1" }],
      },
    ]);
    expect(listBySubjectIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectIds: ["project-1"],
    });
    expect(listAccessiblePendingByProjectIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["finance"],
      permissionCodes: ["project.read"],
      projectIds: ["project-1"],
      limit: 100,
    });
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
    current_node_key: "procedure_demolition",
    current_node_title: "拆改",
    current_business_kind: "procedure_template",
    pending_task_count: 1,
    created_at: NOW,
    updated_at: NOW,
  };
}

function runtimeInstance(): WorkflowRuntimeProjectionRow {
  return {
    id: "instance-1",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    version_id: "version-1",
    subject_type: "project",
    subject_id: "project-1",
    status: "running",
    current_node_key: "procedure_plumbing_electrical",
    current_node_snapshot: plumbingNode(),
    started_at: NOW,
    created_at: NOW,
    updated_at: NOW,
  };
}

function pendingTask(): WorkflowTaskWithInstanceRow {
  return {
    id: "task-1",
    tenant_id: "tenant-1",
    instance_id: "instance-1",
    instance_node_id: "run-plumbing",
    definition_id: "definition-1",
    version_id: "version-1",
    node_id: "node-plumbing",
    node_key: "procedure_plumbing_electrical",
    node_type: "procedure",
    title: "完成水电",
    status: "pending",
    assignee_employee_id: "employee-1",
    assignee_role_code: null,
    assignee_permission_code: null,
    due_at: null,
    completed_by: null,
    completed_at: null,
    created_at: NOW,
    updated_at: NOW,
    assignee_employee: {
      id: "employee-1",
      name: "测试员工",
      avatar: null,
    },
    instance: {
      id: "instance-1",
      subject_type: "project",
      subject_id: "project-1",
      status: "running",
      current_node_key: "procedure_plumbing_electrical",
      current_node_snapshot: plumbingNode(),
    },
  };
}

function completedNode(id: string, nodeKey: string): WorkflowInstanceNodeRow {
  return {
    id: `run-${nodeKey}`,
    tenant_id: "tenant-1",
    instance_id: "instance-1",
    definition_id: "definition-1",
    version_id: "version-1",
    node_id: id,
    node_key: nodeKey,
    node_type: "procedure",
    node_snapshot: demolitionNode(),
    status: "completed",
    input: {},
    output: {},
    started_by: "employee-1",
    completed_by: "employee-1",
    started_at: NOW,
    completed_at: NOW,
    created_at: NOW,
    updated_at: NOW,
  };
}

function graph(): WorkflowGraphResult {
  return {
    definition: {
      id: "definition-1",
      tenant_id: "tenant-1",
      workflow_key: "project_construction_main",
      name: "项目施工主流程",
      description: null,
      category: "construction",
      status: "active",
      active_version_id: "version-1",
      created_by: null,
      updated_by: null,
      created_at: NOW,
      updated_at: NOW,
    },
    version: {
      id: "version-1",
      tenant_id: "tenant-1",
      definition_id: "definition-1",
      version_number: 1,
      status: "published",
      snapshot: {},
      validation_result: {},
      published_by: null,
      published_at: NOW,
      created_at: NOW,
    },
    nodes: [
      {
        id: "node-start",
        tenant_id: "tenant-1",
        definition_id: "definition-1",
        node_key: "start",
        node_type: "start",
        business_kind: null,
        title: "开始",
        description: null,
        position: { x: 0, y: 0 },
        config: {},
        sort_order: 0,
        created_at: NOW,
        updated_at: NOW,
      },
      demolitionNode(),
      plumbingNode(),
    ],
    edges: [
      {
        id: "edge-1",
        tenant_id: "tenant-1",
        definition_id: "definition-1",
        source_node_id: "node-start",
        target_node_id: "node-demolition",
        label: null,
        condition: { operator: "always" },
        priority: 0,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "edge-2",
        tenant_id: "tenant-1",
        definition_id: "definition-1",
        source_node_id: "node-demolition",
        target_node_id: "node-plumbing",
        label: null,
        condition: { operator: "always" },
        priority: 0,
        created_at: NOW,
        updated_at: NOW,
      },
    ],
  };
}

function demolitionNode(): WorkflowNodeRow {
  return {
    id: "node-demolition",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    node_key: "procedure_demolition",
    node_type: "procedure",
    business_kind: "procedure_template",
    title: "拆改",
    description: null,
    position: { x: 100, y: 0 },
    config: {
      stage_key: "demolition",
      require_log: true,
      min_image_count: 3,
      trigger_acceptance: false,
    },
    sort_order: 1,
    created_at: NOW,
    updated_at: NOW,
  };
}

function plumbingNode(): WorkflowNodeRow {
  return {
    id: "node-plumbing",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    node_key: "procedure_plumbing_electrical",
    node_type: "procedure",
    business_kind: "procedure_template",
    title: "水电",
    description: null,
    position: { x: 200, y: 0 },
    config: {
      stage_key: "plumbing_electrical",
      require_log: true,
      min_image_count: 3,
      trigger_acceptance: true,
    },
    sort_order: 2,
    created_at: NOW,
    updated_at: NOW,
  };
}
