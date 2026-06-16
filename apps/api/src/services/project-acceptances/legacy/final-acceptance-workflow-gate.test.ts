import { describe, expect, mock, test } from "bun:test";

const listProjectConstructionStagesForProject = mock(async () => ({
  required_completed: true,
  missing_required_stages: [],
}));

let currentWorkflowProgress = {
  source: "workflow_runtime",
  instance_id: "instance-1",
  instance_status: "running",
  current_node_key: "final_acceptance",
  current_node_title: "竣工验收",
  current_node_type: "business",
  current_business_kind: "final_acceptance",
  current_stage_code: null,
  current_gate: null,
  timeline_nodes: [],
  pending_task_count: 1,
  actions: [],
  warnings: [],
};

const getProjectProgress = mock(async () => currentWorkflowProgress);

mock.module("@/services/construction-stage-status", () => ({
  constructionStageStatusService: {
    listProjectConstructionStagesForProject,
  },
}));

mock.module("@/services/project-workflow-progress", () => ({
  projectWorkflowProgressService: {
    getProjectProgress,
  },
}));

const project = {
  id: "project-1",
  tenant_id: "tenant-1",
  name: "测试项目",
  customer_id: "customer-1",
};

describe("assertCanCreateFinalAcceptanceForProject", () => {
  test("allows final acceptance when workflow runtime is at final_acceptance", async () => {
    currentWorkflowProgress = {
      source: "workflow_runtime",
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "final_acceptance",
      current_node_title: "竣工验收",
      current_node_type: "business",
      current_business_kind: "final_acceptance",
      current_stage_code: null,
      current_gate: null,
      timeline_nodes: [],
      pending_task_count: 1,
      actions: [],
      warnings: [],
    };
    const { assertCanCreateFinalAcceptanceForProject } = await import(
      "./permissions"
    );

    await expect(assertCanCreateFinalAcceptanceForProject({
      ...project,
      status: "acceptance",
    })).resolves.toBeUndefined();
  });

  test("blocks final acceptance when workflow runtime is not at final_acceptance", async () => {
    currentWorkflowProgress = {
      source: "workflow_runtime",
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "payment_stage_3",
      current_node_title: "工程尾款",
      current_node_type: "confirmation",
      current_business_kind: "payment_collection",
      current_stage_code: null,
      current_gate: null,
      timeline_nodes: [],
      pending_task_count: 1,
      actions: [],
      warnings: [],
    };

    const { assertCanCreateFinalAcceptanceForProject } = await import(
      "./permissions"
    );

    await expect(assertCanCreateFinalAcceptanceForProject({
      ...project,
      status: "constructing",
    })).rejects.toThrow("当前 workflow 未到竣工验收节点");
  });
});
