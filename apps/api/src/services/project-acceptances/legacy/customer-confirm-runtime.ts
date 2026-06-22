import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { ProjectAcceptanceRow } from "@/repositories/project-acceptances";
import { projectAcceptanceWorkflowRuntimeService } from "@/services/project-acceptance-workflow-runtime";
import type { ProjectLogStageCode } from "@gooes/domain";

export async function syncConfirmedAcceptanceRuntime(input: {
  row: Pick<ProjectAcceptanceRow, "id" | "project_id">;
  stageCode: ProjectLogStageCode;
  tenantId: string | null;
  customerId: string;
  comment?: string | null;
}) {
  if (!input.tenantId) {
    throw Errors.business(
      409,
      "流程运行态不可用，不能推进验收流程",
      ErrorCodes.WORKFLOW_PROGRESS_CONFLICT,
      { acceptance_id: input.row.id, project_id: input.row.project_id },
    );
  }

  const runtimeMetadata = await projectAcceptanceWorkflowRuntimeService
    .syncCustomerConfirmAcceptance({
      tenantId: input.tenantId,
      projectId: input.row.project_id,
      acceptanceId: input.row.id,
      stageCode: input.stageCode,
      customerId: input.customerId,
      comment: input.comment,
    });
  if (
    runtimeMetadata.status === "advanced" ||
    runtimeMetadata.status === "already_advanced"
  ) {
    return;
  }

  throw Errors.business(
    409,
    "验收已确认，但流程运行态推进失败",
    ErrorCodes.WORKFLOW_PROGRESS_CONFLICT,
    {
      acceptance_id: input.row.id,
      project_id: input.row.project_id,
      stage_code: input.stageCode,
      workflow_runtime: runtimeMetadata,
    },
  );
}
