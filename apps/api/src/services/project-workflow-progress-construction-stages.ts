import type { ProjectWorkflowProgress } from "@/services/project-workflow-progress";
import {
  enrichWorkflowTimelineNodesWithConstructionStages,
  type ConstructionStagesForWorkflowTimeline,
} from "@/services/project-workflow-timeline-contract";

export function enrichProjectWorkflowProgressWithConstructionStages(
  progress: ProjectWorkflowProgress,
  constructionStages: ConstructionStagesForWorkflowTimeline | null | undefined,
): ProjectWorkflowProgress {
  const timelineNodes = enrichWorkflowTimelineNodesWithConstructionStages(
    progress.timeline_nodes,
    constructionStages,
  );
  const currentTimelineActions = progress.current_node_key
    ? timelineNodes.find((node) => node.node_key === progress.current_node_key)
      ?.actions
    : undefined;

  return {
    ...progress,
    timeline_nodes: timelineNodes,
    actions: currentTimelineActions ?? progress.actions,
  };
}
