import type { WorkflowNode } from "./workflow-types";
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

export type WorkflowProcedureStageAvailability = {
  value: string;
  label: string;
  usedBy: string[];
  disabled: boolean;
};

export const ALL_PROCEDURE_STAGES_USED_MESSAGE =
  "6种工序均已配置，每种工序只能使用一次，请编辑已有节点。";

export function getWorkflowProcedureStageAvailability(
  nodes: readonly WorkflowNode[],
  currentNodeId?: string,
): WorkflowProcedureStageAvailability[] {
  return WorkflowProcedureStageOptions.map((option) => {
    const usedBy = nodes
      .filter((node) => node.id !== currentNodeId && node.node_type === "procedure"
        && "stage_key" in node.config && node.config.stage_key === option.value)
      .map((node) => node.title.trim() || "未命名工序节点");
    return { ...option, usedBy, disabled: usedBy.length > 0 };
  });
}
