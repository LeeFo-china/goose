import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
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

export function assertEmployeeCanCreateAssignmentProjectLog(input: {
  authContext: AuthContext;
  assignment: ProcedureAssignmentRow | null;
  tenantToday: string;
  canWriteByProjectAccess?: boolean;
}): void {
  const scope = accessPolicyService.assertPermission(
    input.authContext,
    "project_log.create",
  );
  if (!scope || !input.authContext.employeeId) {
    throw Errors.business(
      403,
      "无施工日志创建权限",
      ErrorCodes.PROJECT_LOG_PERMISSION_DENIED,
    );
  }

  assertAssignmentCanCreateProjectLog({
    assignment: input.assignment,
    tenantToday: input.tenantToday,
  });

  if (
    scope !== "all" &&
    input.assignment?.assignee_employee_id !== input.authContext.employeeId &&
    input.canWriteByProjectAccess !== true
  ) {
    throw Errors.business(
      403,
      "当前员工不是当前工序施工人员，不能新增施工日志",
      ErrorCodes.PROJECT_LOG_PERMISSION_DENIED,
    );
  }
}
