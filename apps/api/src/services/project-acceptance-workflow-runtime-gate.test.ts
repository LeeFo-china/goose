import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type {
  WorkflowDefinitionRow, WorkflowGraphResult, WorkflowInstanceNodeRow,
  WorkflowInstanceRow, WorkflowNodeRow, WorkflowRuntimeCompleteNodeInput,
  WorkflowRuntimeCompleteNodeResult, WorkflowTaskRow,
} from "@/repositories/workflows";
import { workflowDefinitionFixture } from "./project-acceptance-workflow-runtime.test-fixtures";

const definition: WorkflowDefinitionRow = { ...workflowDefinitionFixture, category: "construction", status: "active" };
const now = "2026-10-08T00:00:00.000Z";
function procedure(stage: "plumbing_electrical" | "woodwork"): WorkflowNodeRow {
  return { id: `node-${stage}`, tenant_id: definition.tenant_id, definition_id: definition.id,
    node_key: `procedure_${stage}`, node_type: "procedure", business_kind: "procedure_template",
    title: stage, description: null, position: { x: 0, y: 0 },
    config: { stage_key: stage, trigger_acceptance: true, require_log: true, min_image_count: 1 },
    sort_order: 1, created_at: now, updated_at: now };
}
const plumbing = procedure("plumbing_electrical");
const woodwork = procedure("woodwork");
function instanceAt(node: WorkflowNodeRow): WorkflowInstanceRow {
  return { id: "instance-1", tenant_id: "tenant-1", definition_id: definition.id, version_id: "version-1",
    subject_type: "project", subject_id: "project-1", status: "running", context: {},
    current_node_id: node.id, current_node_key: node.node_key, current_node_snapshot: { ...node },
    started_by: null, completed_by: null, started_at: now, completed_at: null,
    archived_at: null, archived_by: null, archive_reason: null, created_at: now, updated_at: now };
}
function nodeRun(): WorkflowInstanceNodeRow {
  return { id: "run-plumbing", tenant_id: "tenant-1", instance_id: "instance-1", definition_id: definition.id,
    version_id: "version-1", node_id: plumbing.id, node_key: plumbing.node_key, node_type: "procedure",
    node_snapshot: { ...plumbing }, status: "running", input: {}, output: { procedure_completed: true },
    started_by: "employee-1", completed_by: null, started_at: now, completed_at: null,
    created_at: now, updated_at: now };
}
const pendingTask: WorkflowTaskRow = {
  id: "task-plumbing", tenant_id: "tenant-1", instance_id: "instance-1", instance_node_id: "run-plumbing",
  definition_id: definition.id, version_id: "version-1", node_id: plumbing.id, node_key: plumbing.node_key,
  node_type: "procedure", title: "水电", status: "pending", assignee_employee_id: "employee-1",
  assignee_role_code: null, assignee_permission_code: null, due_at: null, completed_by: null,
  completed_at: null, created_at: now, updated_at: now,
};
const graph: WorkflowGraphResult = { definition, version: null, nodes: [plumbing, woodwork], edges: [{
  id: "edge-1", tenant_id: "tenant-1", definition_id: definition.id, source_node_id: plumbing.id,
  target_node_id: woodwork.id, label: null, condition: { operator: "always" }, priority: 1,
  created_at: now, updated_at: now,
}] };
const confirmInput = { tenantId: "tenant-1", projectId: "project-1", acceptanceId: "acceptance-water",
  stageCode: "plumbing_electrical", customerId: "customer-1", comment: "水电验收通过" } as const;
let current = instanceAt(plumbing);
let persistedNode = nodeRun();
let task = { ...pendingTask };
let completedNodes: WorkflowInstanceNodeRow[] = [];

// This fixture represents the SQL contract, not a replacement for the parent's real SQL gate tests.
const completeRuntimeNode = mock(async (_input: WorkflowRuntimeCompleteNodeInput): Promise<WorkflowRuntimeCompleteNodeResult> => {
  persistedNode = { ...persistedNode, status: "completed", completed_at: now };
  completedNodes = [persistedNode];
  task = { ...task, status: "completed", completed_at: now };
  current = instanceAt(woodwork);
  return { ok: true, instance: current, completedNode: { ...plumbing }, nextNode: { ...woodwork }, task: null };
});
const listCompletedRuntimeProcedureNodes = mock(async () => completedNodes);
const syncFromRuntimeInstance = mock(async () => undefined);
const markProcedureCompletedByStage = mock(async () => null);
const invalidateProjectWorkflowProgress = mock(() => undefined);
mock.module("@/repositories/workflows", () => ({ workflowRepository: {
  findLatestRunningRuntimeInstance: mock(async () => current),
  findDefinitionById: mock(async () => definition),
  getRuntimeInstanceById: mock(async () => current),
  getGraph: mock(async () => graph),
  listCompletedRuntimeProcedureNodes, completeRuntimeNode,
} }));
mock.module("@/services/workflow-subject-state", () => ({ workflowSubjectStateService: { syncFromRuntimeInstance } }));
mock.module("@/services/project-procedure-assignments/completion-sync", () => ({ projectProcedureAssignmentCompletionSyncService: { markProcedureCompletedByStage } }));
mock.module("@/services/project-workflow-progress-invalidation", () => ({ invalidateProjectWorkflowProgress }));

let service: typeof import("./project-acceptance-workflow-runtime").projectAcceptanceWorkflowRuntimeService;
beforeAll(async () => {
  ({ projectAcceptanceWorkflowRuntimeService: service } = await import("./project-acceptance-workflow-runtime"));
});

describe("acceptance gate runtime orchestration", () => {
  beforeEach(() => {
    current = instanceAt(plumbing);
    persistedNode = nodeRun();
    task = { ...pendingTask };
    completedNodes = [];
    completeRuntimeNode.mockClear();
    listCompletedRuntimeProcedureNodes.mockClear();
    syncFromRuntimeInstance.mockClear();
    markProcedureCompletedByStage.mockClear();
    invalidateProjectWorkflowProgress.mockClear();
  });

  test("held running node/pending task advances via the existing RPC once, repeated confirmation never completes woodwork", async () => {
    expect(persistedNode).toMatchObject({ status: "running", output: { procedure_completed: true } });
    expect(task.status).toBe("pending");
    const first = await service.syncCustomerConfirmAcceptance(confirmInput);
    expect(first).toMatchObject({ status: "advanced", node_key: plumbing.node_key, next_node_key: woodwork.node_key });
    expect(completeRuntimeNode).toHaveBeenCalledWith({
      tenantId: "tenant-1", definitionId: definition.id, instanceId: "instance-1", nodeKey: plumbing.node_key,
      action: "customer_confirm_acceptance", actorEmployeeId: null, output: {
        source: "project_acceptance_customer_confirm", project_id: "project-1", acceptance_id: "acceptance-water",
        stage_code: "plumbing_electrical", customer_id: "customer-1", comment: "水电验收通过",
      },
    });
    expect(completeRuntimeNode.mock.calls[0]?.[0].output).not.toHaveProperty("procedure_completed");
    const second = await service.syncCustomerConfirmAcceptance(confirmInput);
    expect(second).toMatchObject({ status: "already_advanced", current_node_key: woodwork.node_key,
      reason: "completed_procedure_already_advanced" });
    expect(completeRuntimeNode).toHaveBeenCalledTimes(1);
    expect(current.current_node_key).toBe(woodwork.node_key);
  });

  test("historical completed plumbing catchup leaves the current woodwork node and task untouched", async () => {
    current = instanceAt(woodwork);
    completedNodes = [{ ...nodeRun(), status: "completed", completed_at: now }];
    task = { ...pendingTask, id: "task-woodwork", node_id: woodwork.id, node_key: woodwork.node_key };
    const before = structuredClone({ current, task });
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await service.syncCustomerConfirmAcceptance(confirmInput)).toMatchObject({
        status: "already_advanced", current_node_key: woodwork.node_key, reason: "completed_procedure_already_advanced",
      });
    }
    expect({ current, task }).toEqual(before);
    expect(completeRuntimeNode).not.toHaveBeenCalled();
    expect(listCompletedRuntimeProcedureNodes).toHaveBeenCalledWith({ tenantId: "tenant-1",
      definitionId: definition.id, instanceId: "instance-1" });
    expect(markProcedureCompletedByStage).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1",
      stageCode: "plumbing_electrical", operatorEmployeeId: null });
  });

  test("a different current stage alone is not proof the accepted procedure completed", async () => {
    current = instanceAt(woodwork);
    expect(await service.syncCustomerConfirmAcceptance(confirmInput)).toMatchObject({
      status: "failed", reason: "current_node_stage_mismatch",
    });
    expect(completeRuntimeNode).not.toHaveBeenCalled();
    expect(markProcedureCompletedByStage).not.toHaveBeenCalled();
    expect(syncFromRuntimeInstance).not.toHaveBeenCalled();
  });

  test.each(["acceptance_required", "acceptance_not_confirmed", "procedure_not_completed"] as const)(
    "retains SQL refusal %s without marking assignments or projecting a false advance", async (reason) => {
      completeRuntimeNode.mockImplementationOnce(async () => ({ ok: false, reason, currentNodeKey: plumbing.node_key }));
      expect(await service.syncCustomerConfirmAcceptance(confirmInput)).toMatchObject({
        status: "failed", reason, node_key: plumbing.node_key, current_node_key: plumbing.node_key,
      });
      expect(persistedNode.status).toBe("running");
      expect(task.status).toBe("pending");
      expect(markProcedureCompletedByStage).not.toHaveBeenCalled();
      expect(syncFromRuntimeInstance).not.toHaveBeenCalled();
      expect(invalidateProjectWorkflowProgress).not.toHaveBeenCalled();
    },
  );

  test("retry after projection failure sees the completed plumbing node and never advances woodwork", async () => {
    syncFromRuntimeInstance.mockImplementationOnce(async () => { throw Errors.dbError("同步流程投影失败"); });
    await expect(service.syncCustomerConfirmAcceptance(confirmInput)).rejects.toThrow("同步流程投影失败");
    expect(current.current_node_key).toBe(woodwork.node_key);
    expect(await service.syncCustomerConfirmAcceptance(confirmInput)).toMatchObject({ status: "already_advanced" });
    expect(completeRuntimeNode).toHaveBeenCalledTimes(1);
    expect(syncFromRuntimeInstance).toHaveBeenCalledTimes(2);
    expect(current.current_node_key).toBe(woodwork.node_key);
  });

  test("a concurrently advanced node is not completed a second time when SQL rejects the stale node key", async () => {
    completeRuntimeNode.mockImplementationOnce(async () => {
      current = instanceAt(woodwork);
      completedNodes = [{ ...nodeRun(), status: "completed", completed_at: now }];
      return { ok: false, reason: "node_not_current", currentNodeKey: woodwork.node_key };
    });
    expect(await service.syncCustomerConfirmAcceptance(confirmInput)).toMatchObject({ status: "failed", reason: "node_not_current" });
    expect(await service.syncCustomerConfirmAcceptance(confirmInput)).toMatchObject({ status: "already_advanced" });
    expect(completeRuntimeNode).toHaveBeenCalledTimes(1);
    expect(current.current_node_key).toBe(woodwork.node_key);
  });
});
