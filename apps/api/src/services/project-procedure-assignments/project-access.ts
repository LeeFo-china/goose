import {
  projectProcedureAssignmentRepository,
} from "@/repositories/project-procedure-assignments";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export async function canAccessProjectByProcedureAssignment(input: {
  authContext: AuthContext;
  projectId: string;
}): Promise<boolean> {
  if (
    !input.authContext.tenantId ||
    !input.authContext.employeeId ||
    !accessPolicyService.hasPermission(input.authContext, "project.read")
  ) {
    return false;
  }

  return projectProcedureAssignmentRepository.hasActiveProjectAssignmentForEmployee({
    tenantId: input.authContext.tenantId,
    projectId: input.projectId,
    employeeId: input.authContext.employeeId,
  });
}
