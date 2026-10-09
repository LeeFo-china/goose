import { beforeAll, beforeEach, expect, mock, test } from "bun:test";
const tenantId = "tenant-a";
const completedAt = "2026-10-09T05:32:45.915399Z";
const graph = {
  definition: { workflow_key: "construction", category: "construction" },
  nodes: [{ id: "node-1", node_key: "started", title: "确认开工", node_type: "construction_stage", business_kind: "construction_start", config: {} }], edges: [],
};
const instances = ["project-1", "project-2"].map((subject_id, i) => ({
  id: `instance-${i + 1}`, tenant_id: tenantId, subject_id, definition_id: "definition-1", version_id: "version-1", status: "completed", current_node_key: "end", current_node_snapshot: { title: "结束", node_type: "end" },
}));
const runtimeNodes = instances.map((instance, i) => ({
  tenant_id: tenantId, instance_id: instance.id, node_key: "started", status: "completed", completed_by: i === 0 ? "operator" : null, completed_at: completedAt, started_at: "2026-10-09T05:32:36Z", output: {},
}));
const employees = mock(async (_input: unknown): Promise<Array<{id: string; name: string}>> => [{ id: "operator", name: "风清扬" }]);
const listRuntime = mock(async (_input: unknown) => instances);
const listNodes = mock(async (_input: unknown) => runtimeNodes);
const getGraph = mock(async (_input: unknown) => graph);
mock.module("@/repositories/workflow-subject-states", () => ({ workflowSubjectStateRepository: { listBySubjectIds: async () => [], listLatestRuntimeInstancesBySubjectIds: listRuntime } }));
mock.module("@/repositories/workflows", () => ({ workflowRepository: { listRuntimeInstanceNodesByInstanceIds: listNodes, getGraph } }));
mock.module("@/repositories/tenant-owner-dashboard-workflow", () => ({ tenantOwnerDashboardWorkflowRepository: { listCompletionEmployees: employees, listLatestAcceptancesForProjects: async () => [], listProcedureAssignmentsForRuntimeIds: async () => [] } }));
let reader: typeof import("./tenant-owner-dashboard-workflow-progress").tenantOwnerDashboardWorkflowProgressReader;
let serializeGanttNode: typeof import("./tenant-owner-gantt-node").serializeGanttNode;
beforeAll(async () => {
  reader = (await import("./tenant-owner-dashboard-workflow-progress")).tenantOwnerDashboardWorkflowProgressReader;
  serializeGanttNode = (await import("./tenant-owner-gantt-node")).serializeGanttNode;
});
beforeEach(() => { employees.mockClear(); listNodes.mockClear(); getGraph.mockClear(); });

test("current page shares one employee batch and one graph query, keeps instance evidence distinct", async () => {
  const result = await reader.listProjectProgress({ tenantId, projectIds: ["project-1", "project-2"], businessDate: "2026-10-09" });
  expect(listRuntime).toHaveBeenCalledWith({ tenantId, subjectType: "project", subjectIds: ["project-1", "project-2"] });
  expect(listNodes).toHaveBeenCalledWith({ tenantId, instanceIds: ["instance-1", "instance-2"], limit: 400 });
  expect(employees).toHaveBeenCalledTimes(1);
  expect(employees).toHaveBeenCalledWith({ tenantId, employeeIds: ["operator"] });
  expect(getGraph).toHaveBeenCalledTimes(1);
  const first = serializeGanttNode(result.get("project-1")!.timeline_nodes[0]!);
  const second = serializeGanttNode(result.get("project-2")!.timeline_nodes[0]!);
  expect(first).toMatchObject({ status: "done", actual_completed_at: completedAt, completed_by_employee_id: "operator", completed_by_employee_name: "风清扬", assignment_applicable: false });
  expect(second).toMatchObject({ status: "done", actual_completed_at: completedAt, completed_by_employee_id: null, completed_by_employee_name: null, completion_actor_type: "unknown" });
});
test("previous instance with same node key cannot replace current completion", async () => {
  listNodes.mockResolvedValueOnce([...runtimeNodes, { ...runtimeNodes[0]!, instance_id: "old-instance", completed_at: "2020-01-01T00:00:00Z", completed_by: "old-operator" }]);
  const result = await reader.listProjectProgress({ tenantId, projectIds: ["project-1"], businessDate: "2026-10-09" });
  expect(result.get("project-1")?.timeline_nodes[0]).toMatchObject({ actual_completed_at: completedAt, completed_by_employee_id: "operator" });
});
test("employee query failure reaches existing dashboard partial-error handling", async () => {
  employees.mockRejectedValueOnce(new Error("employee query failed"));
  await expect(reader.listProjectProgress({ tenantId, projectIds: ["project-1"], businessDate: "2026-10-09" })).rejects.toThrow("employee query failed");
});
test("empty page does not query completion employees", async () => {
  expect((await reader.listProjectProgress({ tenantId, projectIds: [], businessDate: "2026-10-09" })).size).toBe(0);
  expect(employees).not.toHaveBeenCalled();
});
