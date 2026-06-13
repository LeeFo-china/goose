import type {
  ConstructionStagesResult,
  ProjectDetailNextAction,
} from "./shared";

export function buildNextAction(this: any, input: {
  constructionStages: ConstructionStagesResult | null;
  workflowBlockingReason?: string | null;
}): ProjectDetailNextAction | null {
  if (input.workflowBlockingReason) {
    return null;
  }

  const acceptanceStage = this.selectNextAcceptanceActionStage(
    input.constructionStages,
  );

  if (acceptanceStage?.acceptance_action?.type) {
    const actionType = acceptanceStage.acceptance_action.type as
      | "create"
      | "edit"
      | "view";
    const actionLabel = acceptanceStage.acceptance_action.label ||
      this.getAcceptanceActionLabel(actionType);
    const title = this.buildAcceptanceNextActionTitle({
      stageLabel: acceptanceStage.stage_label,
      actionType,
      actionLabel,
      acceptanceStatus: acceptanceStage.acceptance_status,
    });
    return {
      kind: "acceptance",
      source: "project_acceptance",
      title,
      description: this.buildAcceptanceNextActionDescription({
        stageLabel: acceptanceStage.stage_label,
        actionType,
        acceptanceStatus: acceptanceStage.acceptance_status,
      }),
      action_label: actionLabel,
      action_type: actionType,
      stage_code: acceptanceStage.stage_code,
      stage_label: acceptanceStage.stage_label,
      acceptance_id: acceptanceStage.acceptance_id ?? null,
      type: actionType,
      label: actionLabel,
      enabled: acceptanceStage.acceptance_action.enabled,
      reason: acceptanceStage.acceptance_action.reason,
    };
  }

  return null;
}

export function selectNextAcceptanceActionStage(this: any, 
  constructionStages: ConstructionStagesResult | null,
) {
  const stages = constructionStages?.stages ?? [];
  const currentStageCode = constructionStages?.current_stage ?? null;

  return stages
    .filter((stage) =>
      stage.acceptance_action?.type &&
      stage.acceptance_action.type !== "none"
    )
    .sort((left, right) =>
      this.getAcceptanceActionPriority(left, currentStageCode) -
      this.getAcceptanceActionPriority(right, currentStageCode)
    )[0] ?? null;
}

export function getAcceptanceActionPriority(this: any, 
  stage: NonNullable<ConstructionStagesResult>["stages"][number],
  currentStageCode: string | null,
) {
  const actionType = stage.acceptance_action?.type;
  const disabledPenalty = stage.acceptance_action?.enabled === false ? 100 : 0;
  const currentStageBonus = stage.stage_code === currentStageCode ? -1 : 0;
  let priority = 20;

  if (stage.acceptance_status === "submitted") {
    priority = 0;
  } else if (actionType === "edit") {
    priority = 1;
  } else if (actionType === "create") {
    priority = 2;
  } else if (stage.status === "pending_acceptance") {
    priority = 3;
  } else if (actionType === "view") {
    priority = 10;
  }

  return disabledPenalty + priority + currentStageBonus;
}

export function getAcceptanceActionLabel(this: any, actionType: "create" | "edit" | "view") {
  if (actionType === "create") return "发起验收";
  if (actionType === "edit") return "处理验收";
  return "查看验收";
}

export function buildAcceptanceNextActionTitle(this: any, input: {
  stageLabel: string;
  actionType: "create" | "edit" | "view";
  actionLabel: string;
  acceptanceStatus?: string | null;
}) {
  if (input.acceptanceStatus === "submitted") {
    return `${input.stageLabel}待复核`;
  }
  if (input.actionType === "edit") {
    return `${input.stageLabel}待处理`;
  }
  if (input.actionType === "view") {
    return `${input.stageLabel}验收记录`;
  }

  return `${input.stageLabel}可推进`;
}

export function buildAcceptanceNextActionDescription(this: any, input: {
  stageLabel: string;
  actionType: "create" | "edit" | "view";
  acceptanceStatus?: string | null;
}) {
  if (input.acceptanceStatus === "submitted") {
    return `员工已提交${input.stageLabel}验收，主管复核后进入业主确认。`;
  }
  if (input.actionType === "edit") {
    return `该阶段验收需要处理，完成后可继续推进${input.stageLabel}施工。`;
  }
  if (input.actionType === "view") {
    return `可查看${input.stageLabel}验收记录，确认阶段状态后再继续施工日志。`;
  }

  return `完成${input.stageLabel}施工后可发起阶段验收。`;
}
