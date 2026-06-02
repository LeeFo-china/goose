import {
  PROJECT_LOG_STAGE_CONFIG,
  type ProjectLogStageCode,
} from "./shared";

export function getStageLabel(stageCode: ProjectLogStageCode) {
  return PROJECT_LOG_STAGE_CONFIG[stageCode]?.label || stageCode;
}

export function getStageAcceptanceLabel(stageCode: ProjectLogStageCode) {
  return `${getStageLabel(stageCode)}验收`;
}
