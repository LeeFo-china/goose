import {
  FINAL_ACCEPTANCE_STAGE_CODE,
} from "@/services/project-final-acceptance-workflow";
import type {
  ConstructionStagesForWorkflowTimeline,
  WorkflowTimelineNodeAction,
} from "@/services/project-workflow-timeline-contract";

type ConstructionStageForWorkflowTimeline =
  NonNullable<ConstructionStagesForWorkflowTimeline["stages"]>[number];

export function buildAcceptanceTimelineAction(input: {
  stage: ConstructionStageForWorkflowTimeline;
  stageCode: string;
  acceptanceStatus: string | null;
}): WorkflowTimelineNodeAction | null {
  const action = input.stage.acceptance_action;
  const actionType = readString(action?.type);
  if (!action || !actionType || actionType === "none") return null;
  if (actionType !== "create" && actionType !== "edit" && actionType !== "view") {
    return null;
  }

  const reason = readString(action.reason);
  return {
    key: `${actionType}_acceptance`,
    label: readString(action.label) ?? "处理验收",
    business_domain: "project_acceptance",
    business_action: actionType,
    disabled: action.enabled !== true,
    ...(reason ? { disabled_reason: reason } : {}),
    stage_code: input.stageCode,
    acceptance_type: input.stageCode === FINAL_ACCEPTANCE_STAGE_CODE
      ? "final"
      : "stage",
    acceptance_id: readString(input.stage.acceptance_id),
    acceptance_status: input.acceptanceStatus,
  };
}

export function getAcceptanceStatusLabel(status: string | null) {
  if (status === "submitted") return "待复核";
  if (status === "leader_approved") return "待业主确认";
  if (status === "rejected") return "需整改";
  return "待验收";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
