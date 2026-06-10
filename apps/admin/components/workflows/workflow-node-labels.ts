import { WorkflowNodeTypeConfig, type WorkflowNodeType } from "@gooes/domain";

export function getWorkflowNodeTypeLabel(nodeType: WorkflowNodeType) {
  return WorkflowNodeTypeConfig[nodeType]?.label || nodeType;
}

export function shouldShowWorkflowNodeTypeBadge(
  title: string,
  nodeType: WorkflowNodeType,
) {
  return title.trim() !== getWorkflowNodeTypeLabel(nodeType).trim();
}
