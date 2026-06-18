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
import {
  projectWorkflowProgressService,
  type ProjectWorkflowProgress,
} from "@/services/project-workflow-progress";

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

type ConstructionStageSourceMode = "workflow_runtime" | "legacy_derived";

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
  workflowProgress?: ProjectWorkflowProgress | null;
  sourceMode?: ConstructionStageSourceMode;
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
  const sourceMode = input.sourceMode ?? "workflow_runtime";
  const workflowProgress = sourceMode === "workflow_runtime"
    ? input.workflowProgress ??
      (input.tenantId
        ? await projectWorkflowProgressService.getProjectProgress({
          tenantId: input.tenantId,
          projectId: input.projectId,
          authContext: input.authContext,
        })
        : null)
    : input.workflowProgress ?? null;

  return buildProjectConstructionStagesFromRows({
    project,
    acceptanceRows,
    logRows,
    latestLogRows,
    authContext: input.authContext,
    canReadAcceptance: input.canReadAcceptance,
    canCreateAcceptance: input.canCreateAcceptance,
    workflowProgress,
    sourceMode,
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
  workflowProgress?: ProjectWorkflowProgress | null;
  sourceMode?: ConstructionStageSourceMode;
}): Promise<ProjectConstructionStagesResult> {
  const project = input.project;
  const sourceMode = input.sourceMode ?? "workflow_runtime";
  const workflowProgress = sourceMode === "workflow_runtime"
    ? input.workflowProgress ?? null
    : null;
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
    const blockedReason = sourceMode === "legacy_derived"
      ? previousStage && !acceptedStages.has(previousStage)
        ? `请先完成${getStageAcceptanceLabel(previousStage)}后再进入${getStageLabel(stageCode)}`
        : null
      : resolveWorkflowStageBlockedReason({
        stageCode,
        acceptedStages,
        workflowProgress,
      });

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
  const isWorkflowFinalAcceptanceCurrent =
    isFinalAcceptanceWorkflowNode(workflowProgress);
  const completionBlockedReason = sourceMode === "legacy_derived"
    ? project.status !== "acceptance"
      ? "项目进入竣工验收后才能发起竣工验收"
      : missingRequiredStages.length > 0
        ? `请先完成${
          missingRequiredStages.map((item) =>
            getStageAcceptanceLabel(item)
          ).join("、")
        }`
        : null
    : resolveWorkflowCompletionBlockedReason({
      missingRequiredStages,
      workflowProgress,
    });
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
    canCreateCompletionAcceptanceByWorkflow: isWorkflowFinalAcceptanceCurrent &&
      missingRequiredStages.length === 0,
    canHandleExistingAcceptance: acceptanceWritableMap
      ? acceptanceWritableMap.get(PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE) ?? false
      : true,
  });
  const allStages = [...stages, completionStage];
  const legacyCurrentStage = stages.find((item) =>
    item.status !== "accepted" && item.status !== "locked"
  ) ?? null;
  const workflowCurrentStage = resolveWorkflowCurrentStage(workflowProgress);
  const currentStage = sourceMode === "legacy_derived"
    ? legacyCurrentStage?.stage_code ?? null
    : workflowCurrentStage;
  const nextStage = sourceMode === "legacy_derived"
    ? legacyCurrentStage
    : resolveWorkflowNextStage(workflowProgress, allStages);

  return {
    project_id: project.id,
    project_status: project.status,
    required_stage_codes: PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
    required_completed: missingRequiredStages.length === 0,
    current_stage: currentStage,
    next_stage: nextStage,
    missing_required_stages: missingRequiredStages.map((stageCode) => ({
      stage_code: stageCode,
      stage_label: getStageLabel(stageCode),
    })),
    stages: allStages,
    all_stage_codes: PROJECT_LOG_STAGE_CODE_VALUES,
  };
}

function resolveWorkflowStageBlockedReason(input: {
  stageCode: ProjectLogStageCode;
  acceptedStages: Set<string>;
  workflowProgress: ProjectWorkflowProgress | null;
}) {
  const progress = input.workflowProgress;
  if (!progress || progress.source !== "workflow_runtime") {
    return "流程运行态缺失，施工阶段暂不可推进";
  }

  if (input.acceptedStages.has(input.stageCode)) {
    return null;
  }

  const currentStage = resolveWorkflowCurrentStage(progress);
  if (currentStage === input.stageCode) {
    return null;
  }

  const paymentGate = progress.current_gate;
  const blockedStage = normalizeStageCode(paymentGate?.blocked_stage_code);
  if (
    paymentGate &&
    blockedStage &&
    getPreviousProjectConstructionStage(blockedStage) === input.stageCode
  ) {
    return null;
  }

  if (paymentGate && blockedStage === input.stageCode) {
    return `请先完成${paymentGate.payment_label}`;
  }

  if (paymentGate && blockedStage && isStageAfter(input.stageCode, blockedStage)) {
    return `请先完成${paymentGate.blocked_stage_label ?? getStageLabel(blockedStage)}后再进入${
      getStageLabel(input.stageCode)
    }`;
  }

  if (currentStage && isStageAfter(input.stageCode, currentStage)) {
    return `请先完成${getStageLabel(currentStage)}后再进入${getStageLabel(input.stageCode)}`;
  }

  return progress.current_node_title
    ? `当前流程在${progress.current_node_title}，暂不可推进${getStageLabel(input.stageCode)}`
    : "当前流程未到此阶段";
}

function resolveWorkflowCompletionBlockedReason(input: {
  missingRequiredStages: ProjectLogStageCode[];
  workflowProgress: ProjectWorkflowProgress | null;
}) {
  const progress = input.workflowProgress;
  if (!progress || progress.source !== "workflow_runtime") {
    return "流程运行态缺失，施工阶段暂不可推进";
  }

  if (input.missingRequiredStages.length > 0) {
    return `请先完成${
      input.missingRequiredStages.map((item) =>
        getStageAcceptanceLabel(item)
      ).join("、")
    }`;
  }

  if (isFinalAcceptanceWorkflowNode(progress)) {
    return null;
  }

  return progress.current_node_title
    ? `当前流程在${progress.current_node_title}，暂不可推进竣工验收`
    : "当前流程未到竣工验收";
}

function isFinalAcceptanceWorkflowNode(
  workflowProgress: ProjectWorkflowProgress | null,
) {
  return workflowProgress?.source === "workflow_runtime" &&
    (workflowProgress.current_node_key === "final_acceptance" ||
      workflowProgress.current_business_kind === "final_acceptance");
}

function resolveWorkflowCurrentStage(
  workflowProgress: ProjectWorkflowProgress | null,
): ProjectLogStageCode | null {
  return normalizeStageCode(workflowProgress?.current_stage_code);
}

function resolveWorkflowNextStage(
  workflowProgress: ProjectWorkflowProgress | null,
  stages: ProjectConstructionStageItem[],
) {
  if (!workflowProgress || workflowProgress.source !== "workflow_runtime") {
    return null;
  }

  if (workflowProgress.current_gate) {
    return null;
  }

  const stageCode = resolveWorkflowCurrentStage(workflowProgress);
  if (!stageCode) return null;

  return stages.find((item) => item.stage_code === stageCode) ?? null;
}

function normalizeStageCode(stageCode: string | null | undefined) {
  return isProjectLogStageCode(stageCode) ? stageCode : null;
}

function isStageAfter(stageCode: ProjectLogStageCode, anchor: ProjectLogStageCode) {
  const stageIndex = PROJECT_LOG_STAGE_CODE_VALUES.indexOf(stageCode);
  const anchorIndex = PROJECT_LOG_STAGE_CODE_VALUES.indexOf(anchor);
  return stageIndex > anchorIndex && anchorIndex >= 0;
}
