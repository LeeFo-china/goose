import { expect, mock, test } from "bun:test";

const workflowRpc = mock(async () => ({ data: {
  ok: true, instance: { id: "instance-1", current_node_key: "plumbing" },
  completed_node: { node_key: "plumbing", status: "running", output: { procedure_completed: true } },
  next_node: null, task: { id: "task-1", status: "pending" }, awaiting_acceptance: true,
}, error: null }));
mock.module("./client", () => ({ workflowRpc, workflowTable: mock() }));

test("preserves atomic completion waiting state without advancing the node or task", async () => {
  const { completeRuntimeNode } = await import("./runtime");
  const result = await completeRuntimeNode({ tenantId: "tenant-1", definitionId: "definition-1",
    instanceId: "instance-1", nodeKey: "plumbing", action: "complete_procedure", output: {} });
  expect(result).toMatchObject({ ok: true, awaitingAcceptance: true,
    completedNode: { status: "running" }, task: { status: "pending" }, nextNode: null });
});
