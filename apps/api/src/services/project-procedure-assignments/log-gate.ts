import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { getEffectiveAssignmentStatus } from "./status";
import type { ProcedureAssignmentRow } from "./types";

export function assertAssignmentCanCreateProjectLog(input: {
  assignment: ProcedureAssignmentRow | null;
  tenantToday: string;
}): void {
  if (!input.assignment) {
    throw Errors.business(
      409,
      "请先开始当前工序派工",
      ErrorCodes.PROCEDURE_ASSIGNMENT_REQUIRED,
    );
  }

  const effectiveStatus = getEffectiveAssignmentStatus({
    status: input.assignment.status,
    plannedStartDate: input.assignment.planned_start_date,
    tenantToday: input.tenantToday,
  });
  if (effectiveStatus !== "in_progress") {
    throw Errors.business(
      409,
      "当前工序尚未开工，不能新增施工日志",
      ErrorCodes.PROCEDURE_NOT_IN_PROGRESS,
    );
  }
}
