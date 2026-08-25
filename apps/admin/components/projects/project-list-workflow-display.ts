type ProjectWorkflowProgressLike = {
  workflow_title?: string | null;
  current_group_label?: string | null;
  current_node_title?: string | null;
  instance_status?: string | null;
};

type ProjectWorkflowSummaryInput = {
  status?: string | null;
  workflow_progress?: ProjectWorkflowProgressLike | null;
};

const instanceStatusLabels: Record<string, string> = {
  running: "进行中",
  completed: "已完成",
  canceled: "已取消",
  failed: "异常",
};

export function projectWorkflowSummary(input: ProjectWorkflowSummaryInput) {
  const progress = input.workflow_progress ?? null;
  const instanceStatus = readString(progress?.instance_status);

  return {
    workflowTitle: readString(progress?.workflow_title) ?? "未接入流程",
    groupLabel: readString(progress?.current_group_label) ?? "未绑定流程",
    nodeLabel: readString(progress?.current_node_title) ?? "未定位当前节点",
    statusLabel: instanceStatus
      ? instanceStatusLabels[instanceStatus] ?? instanceStatus
      : "未知",
  };
}

export function projectStatusStageSummary(input: ProjectWorkflowSummaryInput) {
  if (input.status !== "constructing") return null;
  const progress = input.workflow_progress ?? null;
  const nodeLabel = readString(progress?.current_node_title);
  if (!nodeLabel) return null;
  const instanceStatus = readString(progress?.instance_status);
  const statusLabel = instanceStatus
    ? instanceStatusLabels[instanceStatus] ?? instanceStatus
    : null;
  return statusLabel ? `${nodeLabel}${statusLabel}` : nodeLabel;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
