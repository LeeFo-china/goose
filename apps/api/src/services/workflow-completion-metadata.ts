import { isWorkflowNodeType } from "@gooes/domain";

export type WorkflowCompletionActorType = "employee" | "system" | "unknown";
export type WorkflowCompletionMetadata = {
  actual_started_at: string | null;
  actual_completed_at: string | null;
  completed_by_employee_id: string | null;
  completed_by_employee_name: string | null;
  completion_actor_type: WorkflowCompletionActorType;
  schedule_applicable: boolean | null;
  assignment_applicable: boolean | null;
};
export type WorkflowTimelineNodeCompletion = {
  node_key: string;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by_employee_id?: string | null;
  completed_by_employee_name?: string | null;
  /** Only set system when a trusted execution source positively identifies it. */
  completion_actor_type?: WorkflowCompletionActorType;
};

export function buildWorkflowCompletionMetadata(input: {
  node: { node_type: string | null; config: Record<string, unknown> };
  status: string;
  completion?: WorkflowTimelineNodeCompletion;
}): WorkflowCompletionMetadata {
  const { node, completion } = input;
  const completed = input.status === "done";
  const employeeId = completed ? completion?.completed_by_employee_id ?? null : null;
  // Matches procedure start action's required assignment + planned start/duration.
  const applicable = !isWorkflowNodeType(node.node_type) ? null
    : node.node_type === "procedure" ? node.config.require_procedure_assignment !== false : false;
  return {
    actual_started_at: completion?.started_at ?? null,
    actual_completed_at: completed ? completion?.completed_at ?? null : null,
    completed_by_employee_id: employeeId,
    completed_by_employee_name: employeeId ? completion?.completed_by_employee_name ?? null : null,
    // NULL completed_by can also mean deleted employee or missing historical evidence.
    completion_actor_type: employeeId ? "employee"
      : completed && completion?.completion_actor_type === "system" ? "system" : "unknown",
    schedule_applicable: applicable,
    assignment_applicable: applicable,
  };
}
