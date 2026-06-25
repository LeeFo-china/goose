import type {
  CandidateEmployeeRow,
  ProcedureAssignmentOverlapRow,
} from "@/repositories/project-procedure-assignments";
import type { DepartmentCode, PermissionCode } from "@gooes/domain";
import { calculateRemainingDays } from "./status";

export const DEFAULT_CANDIDATE_DEPARTMENT_CODES: DepartmentCode[] = ["PROJECT"];
export const DEFAULT_CANDIDATE_PERMISSION_CODES: PermissionCode[] = [
  "project_procedure.assignee",
];

export function readCandidateDepartmentCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

export function serializeProcedureCandidate(input: {
  employee: CandidateEmployeeRow;
  overlap: ProcedureAssignmentOverlapRow | null;
  tenantToday: string;
}) {
  const overlap = input.overlap;
  return {
    id: input.employee.id,
    name: input.employee.name,
    avatar: input.employee.avatar,
    status: input.employee.status,
    department: input.employee.tenant_department
      ? {
        id: input.employee.tenant_department.id,
        code: input.employee.tenant_department.code,
        name: input.employee.tenant_department.alias_name,
      }
      : null,
    post: input.employee.post
      ? {
        code: input.employee.post.code,
        name: input.employee.post.name,
      }
      : null,
    busy: Boolean(overlap),
    busy_assignment: overlap
      ? {
        assignment_id: overlap.id,
        project_id: overlap.project_id,
        project_name: overlap.project?.name ?? null,
        node_key: overlap.node_key,
        stage_code: overlap.stage_code,
        planned_start_date: overlap.planned_start_date,
        planned_duration_days: overlap.planned_duration_days,
        planned_end_date: overlap.planned_end_date,
        remaining_days: calculateRemainingDays({
          plannedEndDate: overlap.planned_end_date,
          tenantToday: input.tenantToday,
        }),
      }
      : null,
  };
}
