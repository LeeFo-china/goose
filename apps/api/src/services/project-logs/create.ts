import { projectLogRepository } from "@/repositories/project-logs";
import type { CreateProjectLogInput } from "@/schema/project-logs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { projectProcedureAssignmentService } from "@/services/project-procedure-assignments";
import type { ProjectWorkflowProgress } from "@/services/project-workflow-progress";
import { assertProjectWorkflowStageMutationAllowed } from "@/services/project-workflow-mutation-guards";
import {
  isProjectConstructionStageCode,
  isProjectLogStageCode,
} from "@gooes/domain";
import { resolveProjectLogNodeName } from "./node-name";
import {
  createWorkflowApprovedConstructionLog,
  measureProjectLogCreateStep,
  type ProjectLogCreateTimingSteps,
} from "./workflow-approved-create";

export async function createProjectLogRecord(input: {
  authContext: AuthContext;
  employeeId: string;
  tenantId: string;
  project: { id: string; tenant_id?: string | null };
  payload: CreateProjectLogInput;
  timings?: ProjectLogCreateTimingSteps;
}) {
  const stageCode = isProjectLogStageCode(input.payload.stage_code)
    ? input.payload.stage_code
    : null;
  let workflowProgress: ProjectWorkflowProgress | null = null;
  if (stageCode) {
    workflowProgress = await measureProjectLogCreateStep(
      input.timings,
      "workflow_guard_ms",
      () => assertProjectWorkflowStageMutationAllowed({
        tenantId: input.tenantId,
        projectId: input.project.id,
        stageCode,
        mutation: "create_project_log",
      }),
    ) ?? null;
    await measureProjectLogCreateStep(input.timings, "assignment_guard_ms", () =>
      projectProcedureAssignmentService.assertCanCreateProjectLog({
        authContext: input.authContext,
        projectId: input.project.id,
        stageCode,
      }));
  }

  const payload = stageCode
    ? {
      ...input.payload,
      node_name: resolveProjectLogNodeName({
        requestedNodeName: input.payload.node_name,
        stageCode,
        workflowProgress,
      }),
    }
    : input.payload;

  if (stageCode && isProjectConstructionStageCode(stageCode)) {
    return createWorkflowApprovedConstructionLog({
      authContext: input.authContext,
      tenantId: input.tenantId,
      project: input.project,
      payload,
      timings: input.timings,
    });
  }

  return measureProjectLogCreateStep(
    input.timings,
    "create_rpc_ms",
    () => projectLogRepository.createFast({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      tenantDepartmentId: input.authContext.tenantDepartmentId,
      projectLogScope: accessPolicyService.getScope(
        input.authContext,
        "project_log.create",
      ),
      payload,
    }),
  );
}
