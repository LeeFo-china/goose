import {
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
  PROJECT_LOG_STAGE_CONFIG,
  type ProjectConstructionStageCode,
} from "@gooes/domain";

export const WorkflowProcedureStageOptions = PROJECT_CONSTRUCTION_STAGE_CODE_VALUES
  .map((value) => ({
    value,
    label: PROJECT_LOG_STAGE_CONFIG[value].label,
  }));

export function getWorkflowProcedureStageLabel(stageKey: string | null | undefined) {
  const matched = WorkflowProcedureStageOptions.find((option) =>
    option.value === stageKey
  );
  return matched?.label ?? null;
}

export function isWorkflowProcedureStageKey(
  value: string | null | undefined,
): value is ProjectConstructionStageCode {
  return WorkflowProcedureStageOptions.some((option) => option.value === value);
}

export function createWorkflowProcedureNodeKey(stageKey: ProjectConstructionStageCode) {
  return `procedure_${stageKey}`;
}
