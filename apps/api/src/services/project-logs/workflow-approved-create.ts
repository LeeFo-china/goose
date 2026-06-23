import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { projectLogRepository } from "@/repositories/project-logs";
import type { CreateProjectLogInput } from "@/schema/project-logs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export type ProjectLogCreateTimingSteps = Record<string, number>;

export async function measureProjectLogCreateStep<T>(
  timings: ProjectLogCreateTimingSteps | undefined,
  step: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!timings) {
    return operation();
  }

  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    timings[step] = Date.now() - startedAt;
  }
}

export async function createWorkflowApprovedConstructionLog(input: {
  authContext: AuthContext;
  tenantId: string;
  project: { id: string; tenant_id?: string | null };
  payload: CreateProjectLogInput;
  timings?: ProjectLogCreateTimingSteps;
}): Promise<Record<string, unknown>> {
  const canWrite =
    Boolean(input.authContext.employeeId) &&
    accessPolicyService.hasPermission(input.authContext, "project_log.create") &&
    accessPolicyService.matchesTenant(input.authContext, input.project);
  if (!canWrite) {
    throw Errors.business(
      403,
      "无施工日志创建权限",
      ErrorCodes.PROJECT_LOG_PERMISSION_DENIED,
    );
  }

  return measureProjectLogCreateStep(
    input.timings,
    "create_direct_ms",
    () => projectLogRepository.create({
      project_id: input.project.id,
      tenant_id: input.tenantId,
      employee_id: input.authContext.employeeId,
      stage_code: input.payload.stage_code,
      node_name: input.payload.node_name ?? null,
      content: input.payload.content,
      images: input.payload.images ?? [],
    }),
  );
}
