import type { WorkflowNodeRow } from "@/repositories/workflows";
import {
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
  PROJECT_LOG_STAGE_CONFIG,
  type ProjectConstructionStageCode,
} from "@gooes/domain";

export function findProcedureStageIssues(nodes: WorkflowNodeRow[]) {
  const issues: string[] = [];
  const stageNodeKeys = new Map<ProjectConstructionStageCode, string>();

  for (const node of nodes) {
    if (node.node_type !== "procedure") {
      continue;
    }

    const stageKey = node.config.stage_key;
    if (!isProcedureStageKey(stageKey)) {
      issues.push(
        `工序节点 ${node.node_key} 必须选择拆改、水电、瓦工、木工、油工或安装`,
      );
      continue;
    }

    const existingNodeKey = stageNodeKeys.get(stageKey);
    if (existingNodeKey) {
      issues.push(
        `${PROJECT_LOG_STAGE_CONFIG[stageKey].label}工序重复: ${existingNodeKey}、${node.node_key}`,
      );
      continue;
    }

    stageNodeKeys.set(stageKey, node.node_key);
  }

  return issues;
}

function isProcedureStageKey(
  value: unknown,
): value is ProjectConstructionStageCode {
  return (
    typeof value === "string" &&
    PROJECT_CONSTRUCTION_STAGE_CODE_VALUES.includes(
      value as ProjectConstructionStageCode,
    )
  );
}
