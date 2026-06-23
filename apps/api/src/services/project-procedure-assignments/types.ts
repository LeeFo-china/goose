export const PROCEDURE_ASSIGNMENT_STATUS_VALUES = [
  "planned",
  "in_progress",
  "completed",
  "canceled",
] as const;

export type ProcedureAssignmentStatus =
  (typeof PROCEDURE_ASSIGNMENT_STATUS_VALUES)[number];

export type ProcedureAssignmentEffectiveStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "canceled";

export type ProcedureAssignmentScheduleStatus =
  | "not_started"
  | "on_track"
  | "due_today"
  | "overdue"
  | "completed"
  | "canceled";

export interface ProcedureAssignmentRow {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string;
  workflow_instance_node_id: string | null;
  node_key: string;
  stage_code: string;
  assignee_employee_id: string;
  planned_start_date: string;
  planned_duration_days: number;
  planned_end_date: string;
  status: ProcedureAssignmentStatus;
  started_by_employee_id: string | null;
  started_at: string;
  completed_by_employee_id: string | null;
  completed_at: string | null;
  adjusted_by_employee_id: string | null;
  adjusted_at: string | null;
  adjust_reason: string | null;
  created_at: string;
  updated_at: string;
  assignee_employee?: {
    id: string;
    name: string | null;
    avatar: string | null;
  } | null;
}
