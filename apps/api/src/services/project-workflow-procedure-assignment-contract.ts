import {
  calculateRemainingDays,
  getEffectiveAssignmentStatus,
  getScheduleStatus,
} from "@/services/project-procedure-assignments/status";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments";
import type {
  WorkflowTimelineGraphNodeProjection,
  WorkflowTimelineNodeAction,
  WorkflowTimelineNodeAttributes,
} from "@/services/project-workflow-timeline-contract";

export function buildProcedureAssignmentTimelineAttributes(input: {
  assignment: ProcedureAssignmentRow;
  tenantToday?: string;
}): WorkflowTimelineNodeAttributes {
  const tenantToday = input.tenantToday ?? getToday();
  const projection = buildProcedureAssignmentProjection({
    assignment: input.assignment,
    tenantToday,
  });

  return {
    procedure_assignment_id: input.assignment.id,
    procedure_assignment_status: projection.effectiveStatus,
    procedure_assignee_employee_id: input.assignment.assignee_employee_id,
    procedure_assignee_employee_name:
      input.assignment.assignee_employee?.name ?? null,
    planned_start_date: input.assignment.planned_start_date,
    planned_duration_days: input.assignment.planned_duration_days,
    planned_end_date: input.assignment.planned_end_date,
    remaining_days: projection.remainingDays,
    schedule_status: projection.scheduleStatus,
  };
}

export function buildProcedureAssignmentTimelineActions(input: {
  node: WorkflowTimelineGraphNodeProjection;
  actions: WorkflowTimelineNodeAction[];
  procedureAssignment?: ProcedureAssignmentRow | null;
  tenantToday?: string;
}): WorkflowTimelineNodeAction[] {
  if (input.node.node_type !== "procedure" || !input.procedureAssignment) {
    return input.actions;
  }

  const projection = buildProcedureAssignmentProjection({
    assignment: input.procedureAssignment,
    tenantToday: input.tenantToday ?? getToday(),
  });
  if (
    projection.effectiveStatus === "completed" ||
    projection.effectiveStatus === "canceled"
  ) {
    return [];
  }

  const baseAction = input.actions.find((action) =>
    action.business_domain === "project_procedure"
  );
  if (!baseAction?.task_id) {
    return [];
  }

  const stageCode = readString(input.node.config.stage_key);
  const scheduleFields = buildProcedureScheduleOutputFields({
    assignment: input.procedureAssignment,
    stageCode,
  });
  const completeDisabled = projection.effectiveStatus !== "in_progress";

  return [
    {
      ...baseAction,
      key: "complete_procedure",
      label: input.node.title,
      business_domain: "project_procedure",
      business_action: "complete_procedure",
      disabled: completeDisabled,
      ...(completeDisabled
        ? { disabled_reason: "当前工序尚未到开工时间" }
        : {}),
      output_fields: [],
    },
    {
      ...baseAction,
      key: "adjust_procedure_schedule",
      label: "调整派工",
      business_domain: "project_procedure",
      business_action: "adjust_procedure_schedule",
      disabled: false,
      output_fields: scheduleFields,
    },
  ];
}

function buildProcedureAssignmentProjection(input: {
  assignment: ProcedureAssignmentRow;
  tenantToday: string;
}) {
  const effectiveStatus = getEffectiveAssignmentStatus({
    status: input.assignment.status,
    plannedStartDate: input.assignment.planned_start_date,
    tenantToday: input.tenantToday,
  });
  const remainingDays = calculateRemainingDays({
    plannedEndDate: input.assignment.planned_end_date,
    tenantToday: input.tenantToday,
  });
  const scheduleStatus = getScheduleStatus({
    effectiveStatus,
    plannedStartDate: input.assignment.planned_start_date,
    plannedEndDate: input.assignment.planned_end_date,
    tenantToday: input.tenantToday,
  });

  return {
    effectiveStatus,
    remainingDays,
    scheduleStatus,
  };
}

function buildProcedureScheduleOutputFields(input: {
  assignment: ProcedureAssignmentRow;
  stageCode: string | null;
}) {
  return [
    {
      name: "assignee_employee_id",
      label: "施工人员",
      type: "employee",
      required: true,
      source: "procedure_candidate",
      default_value: input.assignment.assignee_employee_id,
      ...(input.stageCode ? { stage_code: input.stageCode } : {}),
    },
    {
      name: "planned_start_date",
      label: "开工时间",
      type: "date",
      required: true,
      default_value: input.assignment.planned_start_date,
    },
    {
      name: "planned_duration_days",
      label: "工期天数",
      type: "number",
      required: true,
      default_value: input.assignment.planned_duration_days,
      min: 1,
    },
  ];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}
