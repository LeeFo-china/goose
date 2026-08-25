export type ProjectPublicationWorkflowProgress = {
  current_node_title?: string | null;
  instance_status?: string | null;
};

const workflowInstanceStatusLabels: Record<string, string> = {
  running: "进行中",
  completed: "已完成",
  canceled: "已取消",
  failed: "异常",
};

export function projectPublicationStageLabel(row: {
  status?: string | null;
  display_status?: string | null;
  workflow_progress?: ProjectPublicationWorkflowProgress | null;
}): string | null {
  const displayStatus = row.display_status || row.status;
  if (displayStatus !== "started" && displayStatus !== "constructing") return null;
  const nodeLabel = row.workflow_progress?.current_node_title?.trim();
  if (!nodeLabel) return null;
  const instanceStatus = row.workflow_progress?.instance_status?.trim();
  const suffix = instanceStatus
    ? workflowInstanceStatusLabels[instanceStatus] ?? instanceStatus
    : null;
  return suffix ? `${nodeLabel}${suffix}` : nodeLabel;
}
