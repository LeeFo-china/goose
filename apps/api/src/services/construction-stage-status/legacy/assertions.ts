import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
  ErrorCodes,
  Errors,
  getPreviousProjectConstructionStage,
  isProjectConstructionStageCode,
  type ProjectAcceptanceProjectRow,
  type ProjectLogStageCode,
} from "./shared";
import { getStageAcceptanceLabel, getStageLabel } from "./labels";
import { getAcceptedConstructionStages } from "./rows";
import { listProjectConstructionStagesForProject } from "./lists";

export async function assertCanCreateProjectLog(input: {
  projectId: string;
  tenantId?: string | null;
  stageCode: ProjectLogStageCode;
}) {
  const stages = await listProjectConstructionStagesForProject({
    projectId: input.projectId,
    tenantId: input.tenantId,
    canReadAcceptance: true,
    canCreateAcceptance: true,
  });
  const stage = stages.stages.find((item) =>
    item.stage_code === input.stageCode
  );

  if (!stage || stage.is_completion) {
    throw Errors.business(
      400,
      "当前阶段不可写施工日志",
      ErrorCodes.PROJECT_LOG_STAGE_NOT_WRITABLE,
    );
  }

  if (stage.can_create_log) {
    return;
  }

  if (stage.blocked_reason) {
    throw Errors.business(
      400,
      stage.blocked_reason,
      ErrorCodes.PROJECT_LOG_STAGE_BLOCKED,
    );
  }

  if (stage.status === "pending_acceptance") {
    throw Errors.business(
      400,
      `当前${stage.stage_label}阶段待验收，完成验收后再补充施工日志`,
      ErrorCodes.PROJECT_LOG_STAGE_BLOCKED,
    );
  }

  if (stage.status === "accepted") {
    throw Errors.business(
      400,
      `当前${stage.stage_label}阶段已验收完成，不能继续补充施工日志`,
      ErrorCodes.PROJECT_LOG_STAGE_NOT_WRITABLE,
    );
  }

  throw Errors.business(
    400,
    "当前阶段不可写施工日志",
    ErrorCodes.PROJECT_LOG_STAGE_NOT_WRITABLE,
  );
}

export async function assertCanCreateAcceptance(input: {
  project: ProjectAcceptanceProjectRow;
  stageCode: ProjectLogStageCode;
}) {
  if (input.stageCode === PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE) {
    if (input.project.status !== "acceptance") {
      throw Errors.badRequest("项目进入竣工验收后才能发起竣工验收");
    }

    await assertProjectReadyForAcceptance({
      projectId: input.project.id,
      tenantId: input.project.tenant_id,
    });
    return;
  }

  await assertCanEnterConstructionStage({
    projectId: input.project.id,
    tenantId: input.project.tenant_id,
    stageCode: input.stageCode,
  });
}

export async function assertProjectReadyForAcceptance(input: {
  projectId: string;
  tenantId?: string | null;
}) {
  const acceptedStages = await getAcceptedConstructionStages(input);
  const missing = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.filter(
    (stageCode) => !acceptedStages.has(stageCode),
  );

  if (missing.length > 0) {
    throw Errors.badRequest(
      `项目进入竣工验收前，必须先完成${
        missing.map((item) => getStageAcceptanceLabel(item)).join("、")
      }`,
    );
  }
}

async function assertCanEnterConstructionStage(input: {
  projectId: string;
  tenantId?: string | null;
  stageCode: ProjectLogStageCode;
}) {
  if (!isProjectConstructionStageCode(input.stageCode)) {
    return;
  }

  const previousStage = getPreviousProjectConstructionStage(input.stageCode);
  if (!previousStage) {
    return;
  }

  const acceptedStages = await getAcceptedConstructionStages(input);
  if (!acceptedStages.has(previousStage)) {
    throw Errors.badRequest(
      `请先完成${getStageAcceptanceLabel(previousStage)}后再进入${
        getStageLabel(input.stageCode)
      }`,
    );
  }
}
