import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { projectWorkflowProgressService } from "@/services/project-workflow-progress";
import {
  paymentGateGraphFixture,
  workflowDefinitionFixture,
} from "./project-acceptance-workflow-runtime.test-fixtures";

const invalidateProjectProgress = spyOn(projectWorkflowProgressService, "invalidateProject").mockImplementation(() => undefined);
const definition = workflowDefinitionFixture;

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

const finalAcceptanceInstance = {
  ...installationInstance,
  current_node_id: "node-final-acceptance",
  current_node_key: "final_acceptance",
  current_node_snapshot: {
    node_key: "final_acceptance",
    node_type: "construction_stage",
    business_kind: "final_acceptance",
    title: "竣工验收",
    config: {
      stage_type: "final_acceptance",
    },
  },
};

const handoverInstance = {
  ...installationInstance,
  current_node_id: "node-handover",
  current_node_key: "handover",
  current_node_snapshot: {
    node_key: "handover",
    node_type: "confirmation",
    business_kind: null,
    title: "交房",
    config: {},
  },
};

const paymentGateInstance = {
  ...installationInstance,
  current_node_id: "node-payment",
  current_node_key: "payment_stage_2",
  current_node_snapshot: {
    node_key: "payment_stage_2",
    node_type: "confirmation",
    business_kind: "payment_collection",
    title: "中期进度款",
    config: {
      payment_type: "stage_2",
    },
  },
};

const plumbingInstanceWithRequirements = {
  ...installationInstance,
  current_node_id: "node-plumbing",
  current_node_key: "procedure_plumbing_electrical",
  current_node_snapshot: {
    node_key: "procedure_plumbing_electrical",
    node_type: "procedure",
    business_kind: "procedure_template",
    title: "水电",
    config: {
      stage_key: "plumbing_electrical",
      require_log: true,
      min_image_count: 1,
      trigger_acceptance: true,
    },
  },
};

const paymentGateGraph = paymentGateGraphFixture;

let runningInstance:
  | typeof installationInstance
  | typeof paymentGateInstance
  | typeof plumbingInstanceWithRequirements
  | typeof finalAcceptanceInstance = installationInstance;
let graphResult: typeof paymentGateGraph | null = null;

type CompleteRuntimeNodeResultFixture = {
  ok: boolean;
  instance: typeof installationInstance | typeof nextInstance | typeof handoverInstance;
  completedNode: unknown;
  nextNode: unknown;
  task: null;
};

type CompletedRuntimeProcedureNodeFixture = {
  node_type: string;
  node_snapshot: typeof plumbingInstanceWithRequirements.current_node_snapshot;
};

const findDefinitionByKey = mock(async () => null);
const findDefinitionById = mock(async () => definition);
const findLatestRunningRuntimeInstance = mock(async () => runningInstance);
const completeRuntimeNode = mock(async (): Promise<CompleteRuntimeNodeResultFixture> => ({
  ok: true,
  instance: nextInstance,
  completedNode: installationInstance.current_node_snapshot,
  nextNode: nextInstance.current_node_snapshot,
  task: null,
}));
const syncFromRuntimeInstance = mock(async () => null);
const markProcedureCompletedByStage = mock(async () => null);
const getGraph = mock(async () => graphResult);
const listCompletedRuntimeProcedureNodes = mock(
  async (): Promise<CompletedRuntimeProcedureNodeFixture[]> => [],
);
const getRuntimeInstanceById = mock(async () => ({
  status: "completed",
  current_node_key: "procedure_installation",
  current_node_id: "node-1",
}));
const listStageLogEvidence = mock(async () => []);

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getRuntimeInstanceById,
    findDefinitionByKey,
    findDefinitionById,
    findLatestRunningRuntimeInstance,
    completeRuntimeNode,
    getGraph,
    listCompletedRuntimeProcedureNodes,
  },
}));

mock.module("@/repositories/project-log-evidence", () => ({
  projectLogEvidenceRepository: {
    listStageLogEvidence,
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance,
  },
}));

mock.module("@/services/project-procedure-assignments/completion-sync", () => ({
  projectProcedureAssignmentCompletionSyncService: {
    markProcedureCompletedByStage,
  },
}));

describe("projectAcceptanceWorkflowRuntimeService", () => {
  beforeEach(() => {
    runningInstance = installationInstance;
    graphResult = null;
    completeRuntimeNode.mockClear();
    syncFromRuntimeInstance.mockClear();
    markProcedureCompletedByStage.mockClear();
    getGraph.mockClear();
    listCompletedRuntimeProcedureNodes.mockClear();
    listCompletedRuntimeProcedureNodes.mockImplementation(async () => []);
    getRuntimeInstanceById.mockClear();
    getRuntimeInstanceById.mockImplementation(async () => ({ status: "completed", current_node_key: "procedure_installation", current_node_id: "node-1" }));
    listStageLogEvidence.mockClear();
    listStageLogEvidence.mockImplementation(async () => []);
    invalidateProjectProgress.mockClear();
  });

  test("skips workflow completion when customer confirms the procedure before a payment gate", async () => {
    runningInstance = paymentGateInstance;
    graphResult = paymentGateGraph;

    const { projectAcceptanceWorkflowRuntimeService } = await import(
      "./project-acceptance-workflow-runtime"
    );

    const result = await projectAcceptanceWorkflowRuntimeService
      .syncCustomerConfirmAcceptance({
        tenantId: "tenant-1",
        projectId: "project-1",
        acceptanceId: "acceptance-1",
        stageCode: "plumbing_electrical",
        customerId: "customer-1",
        comment: "已确认",
      });

    expect(result).toMatchObject({
      status: "already_advanced",
      workflow_key: "construction_main",
      definition_id: "definition-1",
      instance_id: "instance-1",
      current_node_key: "payment_stage_2",
      reason: "current_payment_gate_after_stage",
    });
    expect(completeRuntimeNode).not.toHaveBeenCalled();
    expect(markProcedureCompletedByStage).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", stageCode: "plumbing_electrical", operatorEmployeeId: null });
    expect(syncFromRuntimeInstance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
    });
    expect(invalidateProjectProgress).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1" });
  });

  test("treats confirmation of an already completed required procedure as already advanced", async () => {
    runningInstance = finalAcceptanceInstance;
    listCompletedRuntimeProcedureNodes.mockImplementationOnce(async () => [{
      node_type: "procedure",
      node_snapshot: plumbingInstanceWithRequirements.current_node_snapshot,
    }]);

    const { projectAcceptanceWorkflowRuntimeService } = await import(
      "./project-acceptance-workflow-runtime"
    );

    const result = await projectAcceptanceWorkflowRuntimeService
      .syncCustomerConfirmAcceptance({
        tenantId: "tenant-1",
        projectId: "project-1",
        acceptanceId: "acceptance-water",
        stageCode: "plumbing_electrical",
        customerId: "customer-1",
        comment: "已确认",
      });

    expect(result).toMatchObject({
      status: "already_advanced",
      current_node_key: "final_acceptance",
      reason: "completed_procedure_already_advanced",
    });
    expect(completeRuntimeNode).not.toHaveBeenCalled();
    expect(markProcedureCompletedByStage).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      stageCode: "plumbing_electrical",
      operatorEmployeeId: null,
    });
    expect(syncFromRuntimeInstance).toHaveBeenCalled();
    expect(invalidateProjectProgress).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
  });

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
    expect(invalidateProjectProgress).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1" });
  });

  test("does not re-check procedure log requirements when customer confirms acceptance", async () => {
    runningInstance = plumbingInstanceWithRequirements;
    graphResult = paymentGateGraph;
    getRuntimeInstanceById.mockImplementationOnce(async () => plumbingInstanceWithRequirements);

    const { projectAcceptanceWorkflowRuntimeService } = await import(
      "./project-acceptance-workflow-runtime"
    );

    const result = await projectAcceptanceWorkflowRuntimeService
      .syncCustomerConfirmAcceptance({
        tenantId: "tenant-1",
        projectId: "project-1",
        acceptanceId: "acceptance-plumbing",
        stageCode: "plumbing_electrical",
        customerId: "customer-1",
        comment: "水电验收确认",
      });

    expect(result.status).toBe("advanced");
    expect(listStageLogEvidence).not.toHaveBeenCalled();
    expect(markProcedureCompletedByStage).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", stageCode: "plumbing_electrical", operatorEmployeeId: null });
    expect(completeRuntimeNode).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
      nodeKey: "procedure_plumbing_electrical",
      action: "customer_confirm_acceptance",
      actorEmployeeId: null,
      output: {
        source: "project_acceptance_customer_confirm",
        project_id: "project-1",
        acceptance_id: "acceptance-plumbing",
        stage_code: "plumbing_electrical",
        customer_id: "customer-1",
        comment: "水电验收确认",
      },
    });
  });

  test("advances final acceptance to handover after customer confirms completion acceptance", async () => {
    runningInstance = finalAcceptanceInstance;
    completeRuntimeNode.mockImplementationOnce(async () => ({
      ok: true,
      instance: handoverInstance,
      completedNode: finalAcceptanceInstance.current_node_snapshot,
      nextNode: handoverInstance.current_node_snapshot,
      task: null,
    }));

    const { projectAcceptanceWorkflowRuntimeService } = await import(
      "./project-acceptance-workflow-runtime"
    );

    const result = await projectAcceptanceWorkflowRuntimeService
      .syncCustomerConfirmAcceptance({
        tenantId: "tenant-1",
        projectId: "project-1",
        acceptanceId: "acceptance-final",
        stageCode: "completion",
        customerId: "customer-1",
        comment: "竣工确认通过",
      });

    expect(result).toMatchObject({
      status: "advanced",
      workflow_key: "construction_main",
      definition_id: "definition-1",
      instance_id: "instance-1",
      node_key: "final_acceptance",
      current_node_key: "handover",
      next_node_key: "handover",
    });
    expect(completeRuntimeNode).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      definitionId: "definition-1",
      instanceId: "instance-1",
      nodeKey: "final_acceptance",
      action: "customer_confirm_acceptance",
      actorEmployeeId: null,
      output: {
        source: "project_acceptance_customer_confirm",
        project_id: "project-1",
        acceptance_id: "acceptance-final",
        stage_code: "completion",
        customer_id: "customer-1",
        comment: "竣工确认通过",
      },
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
