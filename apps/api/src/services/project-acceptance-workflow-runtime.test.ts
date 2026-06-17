import { describe, expect, mock, test } from "bun:test";

const definition = {
  id: "definition-1",
  tenant_id: "tenant-1",
  workflow_key: "construction_main",
  name: "工程主流程",
  description: null,
  category: "construction",
  status: "active",
  active_version_id: "version-1",
  created_by: null,
  updated_by: null,
  created_at: "2026-06-16T00:00:00.000Z",
  updated_at: "2026-06-16T00:00:00.000Z",
};

const installationInstance = {
  id: "instance-1",
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  version_id: "version-1",
  subject_type: "project",
  subject_id: "project-1",
  status: "running",
  context: {},
  current_node_id: "node-1",
  current_node_key: "procedure_installation",
  current_node_snapshot: {
    node_key: "procedure_installation",
    node_type: "procedure",
    business_kind: "procedure_template",
    title: "安装",
    config: {
      stage_key: "installation",
      trigger_acceptance: true,
    },
  },
  started_by: null,
  completed_by: null,
  started_at: "2026-06-16T00:00:00.000Z",
  completed_at: null,
  created_at: "2026-06-16T00:00:00.000Z",
  updated_at: "2026-06-16T00:00:00.000Z",
};

const nextInstance = {
  ...installationInstance,
  current_node_id: "node-2",
  current_node_key: "final_acceptance",
  current_node_snapshot: {
    node_key: "final_acceptance",
    node_type: "approval",
    business_kind: "final_acceptance",
    title: "竣工验收",
    config: {
      stage_type: "final_acceptance",
    },
  },
};

const findDefinitionByKey = mock(async () => null);
const findDefinitionById = mock(async () => definition);
const findLatestRunningRuntimeInstance = mock(async () => installationInstance);
const completeRuntimeNode = mock(async () => ({
  ok: true,
  instance: nextInstance,
  completedNode: installationInstance.current_node_snapshot,
  nextNode: nextInstance.current_node_snapshot,
  task: null,
}));
const syncFromRuntimeInstance = mock(async () => null);
const getRuntimeInstanceById = mock(async () => ({
  status: "completed",
  current_node_key: "procedure_installation",
  current_node_id: "node-1",
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getRuntimeInstanceById,
    findDefinitionByKey,
    findDefinitionById,
    findLatestRunningRuntimeInstance,
    completeRuntimeNode,
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance,
  },
}));

describe("projectAcceptanceWorkflowRuntimeService", () => {
  test("uses the project running workflow instance even when workflow key is dynamic", async () => {
    const { projectAcceptanceWorkflowRuntimeService } = await import(
      "./project-acceptance-workflow-runtime"
    );

    const result = await projectAcceptanceWorkflowRuntimeService
      .syncCustomerConfirmAcceptance({
        tenantId: "tenant-1",
        projectId: "project-1",
        acceptanceId: "acceptance-1",
        stageCode: "installation",
        customerId: "customer-1",
        comment: "已确认",
      });

    expect(result.status).toBe("advanced");
    expect(findLatestRunningRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
    });
    expect(findDefinitionById).toHaveBeenCalledWith(
      "definition-1",
      "tenant-1",
    );
  });

  test("advances the current procedure node after customer confirms stage acceptance", async () => {
    const { projectAcceptanceWorkflowRuntimeService } = await import(
      "./project-acceptance-workflow-runtime"
    );

    const result = await projectAcceptanceWorkflowRuntimeService
      .syncCustomerConfirmAcceptance({
        tenantId: "tenant-1",
        projectId: "project-1",
        acceptanceId: "acceptance-1",
        stageCode: "installation",
        customerId: "customer-1",
        comment: "已确认",
      });

    expect(result).toMatchObject({
      status: "advanced",
      workflow_key: "construction_main",
      definition_id: "definition-1",
      instance_id: "instance-1",
      node_key: "procedure_installation",
      current_node_key: "final_acceptance",
      next_node_key: "final_acceptance",
    });
    expect(completeRuntimeNode).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
      nodeKey: "procedure_installation",
      action: "customer_confirm_acceptance",
      actorEmployeeId: null,
      output: {
        source: "project_acceptance_customer_confirm",
        project_id: "project-1",
        acceptance_id: "acceptance-1",
        stage_code: "installation",
        customer_id: "customer-1",
        comment: "已确认",
      },
    });
    expect(getRuntimeInstanceById).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
    });
    expect(syncFromRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
    });
  });
});
