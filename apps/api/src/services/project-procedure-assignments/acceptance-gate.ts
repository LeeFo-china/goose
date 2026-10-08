import type { ProcedureAssignmentRow } from "./types";

// Only persisted node output or a completed assignment for this exact runtime
// node can make a repeat completion skip the active-assignment gate.
export async function isProcedureAwaitingAcceptance(input: {
  tenantId: string;
  task: {
    instance_id: string; instance_node_id: string | null; node_key: string;
    instance_node?: { procedure_completed?: unknown } | null;
    instance: { subject_id: string; current_node_snapshot?: unknown };
  };
  repository: { listActiveForProject(input: {
    tenantId: string; projectId: string; workflowInstanceId: string;
  }): Promise<ProcedureAssignmentRow[]> };
}): Promise<boolean> {
  const snapshot = asRecord(input.task.instance.current_node_snapshot);
  if (asRecord(snapshot?.config)?.trigger_acceptance !== true) return false;
  if (input.task.instance_node?.procedure_completed === true) return true;
  if (!input.task.instance_node_id) return false;
  const assignments = await input.repository.listActiveForProject({
    tenantId: input.tenantId, projectId: input.task.instance.subject_id,
    workflowInstanceId: input.task.instance_id,
  });
  return assignments.some((assignment) => assignment.status === "completed" &&
    assignment.node_key === input.task.node_key &&
    assignment.workflow_instance_node_id === input.task.instance_node_id);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
