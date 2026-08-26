import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  projectWorkflowProgressService,
  type ProjectWorkflowProgress,
} from "@/services/project-workflow-progress";
import {
  PROJECT_LOG_STAGE_CONFIG,
  getPreviousProjectConstructionStage,
  isProjectConstructionStageCode,
  type ProjectLogStageCode,
} from "@gooes/domain";

type ProjectWorkflowStageMutation =
  | "create_project_log"
  | "create_stage_acceptance"
  | "customer_confirm_acceptance";

export function assertProjectWorkflowStageMutationAllowedFromProgress(input: {
  workflowProgress: ProjectWorkflowProgress;
  mutation: ProjectWorkflowStageMutation;
  stageCode: ProjectLogStageCode;
}) {
  if (!isProjectConstructionStageCode(input.stageCode)) {
    return;
  }

  if (input.workflowProgress.source !== "workflow_runtime") {
    throw Errors.business(
      409,
      `流程运行态不可用，不能操作${getStageLabel(input.stageCode)}`,
      ErrorCodes.WORKFLOW_PROGRESS_CONFLICT,
      {
        stage_code: input.stageCode,
        workflow_progress_source: input.workflowProgress.source,
      },
    );
  }

  if (input.workflowProgress.current_stage_code === input.stageCode) {
    assertAcceptanceEnabledIfNeeded(input);
    return;
  }

  if (isAcceptanceMutationAllowedAfterPaymentGate(input)) {
    assertAcceptanceEnabledIfNeeded(input);
    return;
  }

  if (isRequiredAcceptanceCatchUpMutation(input)) {
    assertAcceptanceEnabledIfNeeded(input);
    return;
  }

  throw Errors.business(
    409,
    `当前流程在${getCurrentNodeLabel(input.workflowProgress)}，不能操作${
      getStageLabel(input.stageCode)
    }`,
    getMutationErrorCode(input.mutation),
    {
      stage_code: input.stageCode,
      current_stage_code: input.workflowProgress.current_stage_code,
      current_node_key: input.workflowProgress.current_node_key,
      current_node_title: input.workflowProgress.current_node_title,
    },
  );
}

function isRequiredAcceptanceCatchUpMutation(input: {
  workflowProgress: ProjectWorkflowProgress;
  mutation: ProjectWorkflowStageMutation;
  stageCode: ProjectLogStageCode;
}) {
  if (input.mutation === "create_project_log") {
    return false;
  }

  return input.workflowProgress.timeline_nodes.some((node) =>
    node.attributes.stage_code === input.stageCode &&
    (node.status === "done" || node.status === "blocked") &&
    node.attributes.acceptance_enabled === true &&
    node.attributes.acceptance_required === true
  );
}

function isAcceptanceMutationAllowedAfterPaymentGate(input: {
  workflowProgress: ProjectWorkflowProgress;
  mutation: ProjectWorkflowStageMutation;
  stageCode: ProjectLogStageCode;
}) {
  if (input.mutation === "create_project_log") {
    return false;
  }

  const blockedStageCode = input.workflowProgress.current_gate?.blocked_stage_code;
  if (!isProjectConstructionStageCode(blockedStageCode)) {
    return false;
  }

  return getPreviousProjectConstructionStage(blockedStageCode) === input.stageCode;
}

function assertAcceptanceEnabledIfNeeded(input: {
  workflowProgress: ProjectWorkflowProgress;
  mutation: ProjectWorkflowStageMutation;
  stageCode: ProjectLogStageCode;
}) {
  if (input.mutation !== "create_stage_acceptance") {
    return;
  }

  const timelineNode = input.workflowProgress.timeline_nodes.find((node) =>
    node.attributes.stage_code === input.stageCode
  );
  if (
    timelineNode?.attributes.acceptance_enabled === true ||
    timelineNode?.attributes.acceptance_required === true
  ) {
    return;
  }

  throw Errors.business(
    409,
    `${getStageLabel(input.stageCode)}工序未开启阶段验收`,
    ErrorCodes.WORKFLOW_ACCEPTANCE_NOT_AVAILABLE,
    {
      stage_code: input.stageCode,
      current_node_key: input.workflowProgress.current_node_key,
      current_node_title: input.workflowProgress.current_node_title,
    },
  );
}

export async function assertProjectWorkflowStageMutationAllowed(input: {
  tenantId: string;
  projectId: string;
  stageCode: ProjectLogStageCode;
  mutation: ProjectWorkflowStageMutation;
}) {
  if (!isProjectConstructionStageCode(input.stageCode)) {
    return;
  }

  const workflowProgress = await projectWorkflowProgressService.getProjectProgress({
    tenantId: input.tenantId,
    projectId: input.projectId,
  });

  assertProjectWorkflowStageMutationAllowedFromProgress({
    workflowProgress,
    stageCode: input.stageCode,
    mutation: input.mutation,
  });
}

function getMutationErrorCode(mutation: ProjectWorkflowStageMutation) {
  if (mutation === "create_project_log") {
    return ErrorCodes.WORKFLOW_STAGE_NOT_CURRENT;
  }
  return ErrorCodes.WORKFLOW_ACCEPTANCE_NOT_AVAILABLE;
}

function getCurrentNodeLabel(progress: ProjectWorkflowProgress) {
  return progress.current_node_title?.trim() || "当前节点";
}

function getStageLabel(stageCode: ProjectLogStageCode) {
  return PROJECT_LOG_STAGE_CONFIG[stageCode]?.label || stageCode;
}
