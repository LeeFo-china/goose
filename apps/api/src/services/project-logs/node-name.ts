import type {
  ProjectWorkflowProgress,
} from "@/services/project-workflow-progress";
import type { ProjectLogStageCode } from "@gooes/domain";

export function resolveProjectLogNodeName(input: {
  requestedNodeName?: string | null;
  stageCode: ProjectLogStageCode;
  workflowProgress: ProjectWorkflowProgress | null;
}): string | null {
  const requestedNodeName = input.requestedNodeName?.trim();
  if (requestedNodeName) return requestedNodeName;
  if (input.workflowProgress?.source !== "workflow_runtime") return null;

  const currentNode = input.workflowProgress.timeline_nodes.find((node) =>
    node.attributes.stage_code === input.stageCode &&
    (node.node_key === input.workflowProgress?.current_node_key ||
      node.status === "current")
  );

  return currentNode?.node_title.trim() || null;
}
