import type { WorkflowTimelineNode } from "./project-workflow-timeline-contract";

export function serializeGanttNode(node: WorkflowTimelineNode) {
  return {
    actual_started_at: node.actual_started_at ?? null,
    actual_completed_at: node.status === "done" ? node.actual_completed_at ?? null : null,
    completed_by_employee_id: node.status === "done" ? node.completed_by_employee_id ?? null : null,
    completed_by_employee_name: node.status === "done" ? node.completed_by_employee_name ?? null : null,
    completion_actor_type: node.status === "done" ? node.completion_actor_type ?? "unknown" : "unknown",
    schedule_applicable: node.schedule_applicable ?? null,
    assignment_applicable: node.assignment_applicable ?? null,
    node_key: node.node_key,
    node_title: node.node_title,
    node_type: node.node_type,
    business_kind: node.business_kind,
    stage_code: node.attributes.stage_code ?? null,
    status: node.status,
    planned_start_date: node.attributes.planned_start_date ?? null,
    planned_end_date: node.attributes.planned_end_date ?? null,
    schedule_status: normalizeScheduleStatus(node.attributes.schedule_status),
    assignee_employee_name:
      node.attributes.procedure_assignee_employee_name ??
        node.attributes.assignee_employee_name ??
        node.assignee_employee_name ??
        null,
    blocked_reason: node.status === "blocked" ? node.display.status_label : null,
  };
}

function normalizeScheduleStatus(value: string | null | undefined) {
  if (value === "overdue") return "delayed";
  if (value === "completed") return "done";
  if (value === "on_track" || value === "due_today") return "on_track";
  return "unscheduled";
}

