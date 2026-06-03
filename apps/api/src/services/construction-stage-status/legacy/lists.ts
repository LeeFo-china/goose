import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
  PROJECT_LOG_STAGE_CODE_VALUES,
  accessPolicyService,
  getPreviousProjectConstructionStage,
  isProjectLogStageCode,
  projectAcceptanceRepository,
  projectLogRepository,
  Errors,
  type AuthContext,
  type ProjectAcceptanceProjectRow,
  type ProjectAcceptanceRow,
  type ProjectLogLatestStageRow,
  type ProjectLogStageCode,
  type ProjectLogStageSummaryRow,
} from "./shared";
import { getStageAcceptanceLabel, getStageLabel } from "./labels";
import { buildAcceptanceWritableMap, canAccessProjectByOptionalPermission } from "./permissions";
import { pickLatestAcceptanceRows } from "./rows";
import { buildStageItem, type ProjectConstructionStageItem } from "./stage-item";

export type ProjectConstructionStagesResult = {
  project_id: string;
  project_status: string | null;
  required_stage_codes: typeof PROJECT_CONSTRUCTION_STAGE_CODE_VALUES;
  required_completed: boolean;
  current_stage: ProjectLogStageCode | null;
  next_stage: ProjectConstructionStageItem | null;
  missing_required_stages: Array<{
    stage_code: ProjectLogStageCode;
    stage_label: string;
  }>;
  stages: ProjectConstructionStageItem[];
  all_stage_codes: typeof PROJECT_LOG_STAGE_CODE_VALUES;
};

export async function listProjectConstructionStages(input: {
  authContext: AuthContext;
  projectId: string;
}): Promise<ProjectConstructionStagesResult> {
  const tenantId = accessPolicyService.assertTenantContext(input.authContext);
  const hasAccess = await accessPolicyService.canAccessProject(
    input.authContext,
    input.projectId,
    "project.read",
  );
  if (!hasAccess) {
    throw Errors.forbidden();
  }

  const [canReadAcceptance, hasCreateAcceptancePermission] = await Promise.all([
    canAccessProjectByOptionalPermission(
      input.authContext,
      input.projectId,
      ["project_acceptance.read", "project_acceptance.manage"],
    ),
    canAccessProjectByOptionalPermission(
      input.authContext,
      input.projectId,
      ["project_acceptance.create"],
    ),
  ]);

  return listProjectConstructionStagesForProject({
    projectId: input.projectId,
    tenantId,
    authContext: input.authContext,
    canReadAcceptance,
    canCreateAcceptance: canReadAcceptance && hasCreateAcceptancePermission,
  });
}

export async function listProjectConstructionStagesForProject(input: {
  projectId: string;
  tenantId?: string | null;
  authContext?: AuthContext;
  canReadAcceptance?: boolean;
  canCreateAcceptance?: boolean;
}): Promise<ProjectConstructionStagesResult> {
  const project = await projectAcceptanceRepository.getProject(
    input.projectId,
    input.tenantId,
  );
  if (!project) {
    throw Errors.badRequest("项目不存在");
  }

  const stageCodes = [
    ...PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
    PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  ];
  const [acceptanceRows, logRows, latestLogRows] = await Promise.all([
    projectAcceptanceRepository.listLatestAcceptancesByStages({
      projectId: input.projectId,
      stageCodes,
      tenantId: input.tenantId,
    }),
    projectLogRepository.listStageCodesByProject({
      projectId: input.projectId,
      tenantId: input.tenantId,
    }),
    projectLogRepository.listLatestLogsByStages({
      projectId: input.projectId,
      stageCodes,
      tenantId: input.tenantId,
    }),
  ]);

  return buildProjectConstructionStagesFromRows({
    project,
    acceptanceRows,
    logRows,
    latestLogRows,
    authContext: input.authContext,
    canReadAcceptance: input.canReadAcceptance,
    canCreateAcceptance: input.canCreateAcceptance,
  });
}

export async function buildProjectConstructionStagesFromRows(input: {
  project: ProjectAcceptanceProjectRow;
  acceptanceRows: ProjectAcceptanceRow[];
  logRows: ProjectLogStageSummaryRow[];
  latestLogRows: ProjectLogLatestStageRow[];
  authContext?: AuthContext;
  canReadAcceptance?: boolean;
  canCreateAcceptance?: boolean;
  canManageAcceptance?: boolean;
}): Promise<ProjectConstructionStagesResult> {
  const project = input.project;
  const acceptanceRows = pickLatestAcceptanceRows(input.acceptanceRows);
  const acceptanceMap = new Map(
    acceptanceRows.map((item) => [item.stage_code, item]),
  );
  const latestLogMap = new Map(
    input.latestLogRows
      .filter((item) => item.stage_code)
      .map((item) => [item.stage_code as string, item]),
  );
  const logStageSet = new Set(
    input.logRows
      .map((item) => item.stage_code)
      .filter((item): item is ProjectLogStageCode =>
        isProjectLogStageCode(item)
      ),
  );
  const acceptedStages = new Set(
    acceptanceRows
      .filter((item) => item.status === "customer_confirmed")
      .map((item) => item.stage_code),
  );
  const acceptanceWritableMap = input.authContext
    ? await buildAcceptanceWritableMap(
      input.authContext,
      acceptanceRows,
      input.canManageAcceptance,
    )
    : null;

  const stages = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.map((stageCode) => {
    const previousStage = getPreviousProjectConstructionStage(stageCode);
    const blockedReason = previousStage && !acceptedStages.has(previousStage)
      ? `请先完成${getStageAcceptanceLabel(previousStage)}后再进入${getStageLabel(stageCode)}`
      : null;

    return buildStageItem({
      stageCode,
      acceptance: input.canReadAcceptance === false
        ? null
        : acceptanceMap.get(stageCode),
      latestLog: latestLogMap.get(stageCode),
      hasLog: logStageSet.has(stageCode),
      blockedReason,
      projectStatus: project.status,
      canCreateAcceptanceByPermission: input.canCreateAcceptance ?? true,
      canHandleExistingAcceptance: acceptanceWritableMap
        ? acceptanceWritableMap.get(stageCode) ?? false
        : true,
    });
  });
  const missingRequiredStages = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.filter(
    (stageCode) => !acceptedStages.has(stageCode),
  );
  const completionBlockedReason = project.status !== "acceptance"
    ? "项目进入竣工验收后才能发起竣工验收"
    : missingRequiredStages.length > 0
      ? `请先完成${
        missingRequiredStages.map((item) =>
          getStageAcceptanceLabel(item)
        ).join("、")
      }`
      : null;
  const completionStage = buildStageItem({
    stageCode: PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
    acceptance: input.canReadAcceptance === false
      ? null
      : acceptanceMap.get(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE),
    latestLog: latestLogMap.get(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE),
    hasLog: logStageSet.has(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE),
    blockedReason: completionBlockedReason,
    projectStatus: project.status,
    canCreateAcceptanceByPermission: input.canCreateAcceptance ?? true,
    canHandleExistingAcceptance: acceptanceWritableMap
      ? acceptanceWritableMap.get(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE) ?? false
      : true,
  });

  return {
    project_id: project.id,
    project_status: project.status,
    required_stage_codes: PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
    required_completed: missingRequiredStages.length === 0,
    current_stage:
      stages.find((item) =>
        item.status !== "accepted" && item.status !== "locked"
      )?.stage_code ?? null,
    next_stage:
      stages.find((item) =>
        item.status !== "accepted" && item.status !== "locked"
      ) ?? null,
    missing_required_stages: missingRequiredStages.map((stageCode) => ({
      stage_code: stageCode,
      stage_label: getStageLabel(stageCode),
    })),
    stages: [...stages, completionStage],
    all_stage_codes: PROJECT_LOG_STAGE_CODE_VALUES,
  };
}
