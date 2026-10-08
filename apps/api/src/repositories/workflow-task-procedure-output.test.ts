import { expect, mock, test } from "bun:test";
import { WORKFLOW_TASK_SELECT } from "./workflow-task-select";
const calls: Array<[string, unknown]> = [];
let nodeInstanceId = "instance-1";
const query = {
  select: (value: string) => { calls.push(["select", value]); return query; },
  eq: (key: string, value: string) => { calls.push([key, value]); return query; },
  in: (_key: string, ids: string[]) => { calls.push(["ids", ids]); return query; },
  limit: async (value: number) => { calls.push(["limit", value]); return { error: null,
    data: [{ id: "run-1", instance_id: nodeInstanceId, procedure_completed: true,
      output: { receipt_url: "private-receipt" } }] }; },
};
mock.module("./workflows/client", () => ({ workflowTable: () => query }));
const task = { instance_id: "instance-1", instance_node_id: "run-1", node_type: "procedure",
  instance: { subject_type: "project" } };

test("hydrates old RPC procedure rows in one bounded tenant-scoped query", async () => {
  const { attachProcedureNodeOutputs } = await import("./workflow-task-procedure-output");
  const rows = await attachProcedureNodeOutputs("tenant-1", [task, task]);
  const projectedNode: unknown = Object.entries(rows[0] ?? {}).find(([key]) => key === "instance_node")?.[1];
  expect(JSON.stringify(projectedNode)).toBe('{"procedure_completed":true}');
  expect(calls).toContainEqual(["select", "id, instance_id, procedure_completed:output->procedure_completed"]);
  expect(WORKFLOW_TASK_SELECT).toContain("instance_node:workflow_instance_nodes!workflow_tasks_instance_node_id_fkey(procedure_completed:output->procedure_completed)");
  expect(calls).toContainEqual(["tenant_id", "tenant-1"]);
  expect(calls).toContainEqual(["ids", ["run-1"]]);
  expect(calls).toContainEqual(["limit", 100]);
});

test("does not attach another runtime instance's completion fact", async () => {
  const { attachProcedureNodeOutputs } = await import("./workflow-task-procedure-output");
  nodeInstanceId = "other-instance";
  expect(await attachProcedureNodeOutputs("tenant-1", [task])).toEqual([task]);
});

test("non-procedure tasks need no hydration query", async () => {
  const { attachProcedureNodeOutputs } = await import("./workflow-task-procedure-output");
  calls.length = 0;
  await attachProcedureNodeOutputs("tenant-1", [{ ...task, node_type: "approval" }]);
  expect(calls).toEqual([]);
});
