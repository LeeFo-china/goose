import type {
  CustomerProjectWorkflowProgress,
  ProjectWorkflowProgress,
} from "@/services/project-workflow-progress";

export function buildMissingProjectWorkflowProgress(
  actions: Array<Record<string, unknown>>,
): ProjectWorkflowProgress {
  return {
    source: "missing_runtime",
    instance_id: null,
    workflow_definition_id: null,
    workflow_title: null,
    instance_status: null,
    current_node_key: null,
    current_node_title: null,
    current_group_key: null,
    current_group_label: null,
    current_group_order: null,
    current_node_type: null,
    current_business_kind: null,
    current_stage_code: null,
    current_gate: null,
    timeline_nodes: [],
    pending_task_count: 0,
    actions,
    warnings: [],
  };
}

export function buildUnavailableProjectWorkflowProgress(): ProjectWorkflowProgress {
  return {
    source: "unavailable",
    instance_id: null,
    workflow_definition_id: null,
    workflow_title: null,
    instance_status: null,
    current_node_key: null,
    current_node_title: null,
    current_group_key: null,
    current_group_label: null,
    current_group_order: null,
    current_node_type: null,
    current_business_kind: null,
    current_stage_code: null,
    current_gate: null,
    timeline_nodes: [],
    pending_task_count: 0,
    actions: [],
    warnings: [],
  };
}

export function toCustomerProjectWorkflowProgress(
  progress: ProjectWorkflowProgress,
): CustomerProjectWorkflowProgress {
  return {
    source: progress.source,
    instance_id: progress.instance_id,
    workflow_definition_id: progress.workflow_definition_id,
    workflow_title: progress.workflow_title,
    instance_status: progress.instance_status,
    current_node_key: progress.current_node_key,
    current_node_title: progress.current_node_title,
    current_group_key: progress.current_group_key,
    current_group_label: progress.current_group_label,
    current_group_order: progress.current_group_order,
    current_node_type: progress.current_node_type,
    current_business_kind: progress.current_business_kind,
    current_stage_code: progress.current_stage_code,
    current_gate: progress.current_gate,
    timeline_nodes: progress.timeline_nodes,
    pending_task_count: progress.pending_task_count,
  };
}
