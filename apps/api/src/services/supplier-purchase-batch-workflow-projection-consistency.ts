import type { WorkflowTaskActionRow } from "@/repositories/workflow-tasks";
import type { WorkflowTaskActionPayload } from "@/services/workflow-task-actions";

export type SupplierPurchaseBatchWorkflowActionCandidate = {
  task: WorkflowTaskActionRow;
  actions: WorkflowTaskActionPayload[];
};

export function actionsMatchingWorkflowState(
  candidates: SupplierPurchaseBatchWorkflowActionCandidate[],
  value: unknown,
): WorkflowTaskActionPayload[] {
  const state = asRecord(value);
  const instanceId = readString(state?.instance_id);
  const currentNodeKey = readString(state?.current_node_key);
  if (!instanceId || !currentNodeKey) return [];

  return candidates.flatMap((candidate) =>
    candidate.task.instance_id === instanceId &&
      candidate.task.node_key === currentNodeKey
      ? candidate.actions
      : []
  );
}

export function alignWorkflowStateActions(
  value: unknown,
  candidates: SupplierPurchaseBatchWorkflowActionCandidate[],
): Record<string, unknown> | null {
  const state = asRecord(value);
  if (!state) return null;
  const actions = actionsMatchingWorkflowState(candidates, state);
  const currentNodeKey = readString(state.current_node_key);
  const timelineNodes = Array.isArray(state.timeline_nodes)
    ? state.timeline_nodes.map((value) => {
      const node = asRecord(value);
      if (!node) return value;
      return {
        ...node,
        actions: readString(node.node_key) === currentNodeKey ? actions : [],
      };
    })
    : state.timeline_nodes;

  return {
    ...state,
    actions,
    ...(Array.isArray(state.timeline_nodes) ? { timeline_nodes: timelineNodes } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
