import {
  workflowSubjectStateRepository,
  type WorkflowSubjectStateRow,
} from "@/repositories/workflow-subject-states";
import type { ProjectWorkflowProgress } from "@/services/project-workflow-progress";

type ProjectWorkflowStateSummary = {
  subject_type: "project";
  subject_id: string;
  instance_id: string | null;
  workflow_definition_id: string | null;
  workflow_title: string | null;
  instance_status: ProjectWorkflowProgress["instance_status"];
  current_node_key: string | null;
  current_node_title: string | null;
  current_group_key: string | null;
  current_group_label: string | null;
  current_group_order: number | null;
  current_business_kind: ProjectWorkflowProgress["current_business_kind"];
  pending_task_count: number;
  actions: ProjectWorkflowProgress["actions"];
  timeline_nodes: ProjectWorkflowProgress["timeline_nodes"];
};

export async function attachProjectWorkflowListSummaries(input: {
  rows: Array<Record<string, unknown>>;
  tenantId: string;
  projectIds: string[];
}): Promise<Array<Record<string, unknown>>> {
  const subjectStates = await workflowSubjectStateRepository.listBySubjectIds({
    tenantId: input.tenantId,
    subjectType: "project",
    subjectIds: input.projectIds,
  });
  const subjectStateByProjectId = new Map(
    subjectStates.map((state) => [state.subject_id, state]),
  );

  return input.rows.map((row) => {
    const projectId = readProjectId(row);
    if (!projectId) return stripLegacyStageFields(row);

    const subjectState = subjectStateByProjectId.get(projectId) ?? null;
    const progress = attachWorkflowDefinitionSummary({
      progress: buildProjectWorkflowListProgress({
        subjectState,
      }),
      subjectState,
      row,
    });

    return {
      ...stripLegacyStageFields(row),
      workflow_progress: progress,
      workflow_state: buildWorkflowStateSummary({
        projectId,
        subjectState,
        progress,
      }),
    };
  });
}

function buildProjectWorkflowListProgress(input: {
  subjectState: WorkflowSubjectStateRow | null;
}): ProjectWorkflowProgress {
  const hasRuntime = Boolean(input.subjectState?.instance_id);

  return {
    source: hasRuntime ? "workflow_runtime" : "missing_runtime",
    instance_id: input.subjectState?.instance_id ?? null,
    workflow_definition_id: input.subjectState?.definition_id ?? null,
    workflow_title: null,
    instance_status: input.subjectState?.instance_status ?? null,
    current_node_key: input.subjectState?.current_node_key ?? null,
    current_node_title: input.subjectState?.current_node_title ?? null,
    current_group_key: null,
    current_group_label: null,
    current_group_order: null,
    current_node_type: null,
    current_business_kind: input.subjectState?.current_business_kind ?? null,
    current_stage_code: null,
    current_gate: null,
    timeline_nodes: [],
    pending_task_count: input.subjectState?.pending_task_count ?? 0,
    actions: [],
    warnings: [],
  };
}

function attachWorkflowDefinitionSummary(input: {
  progress: ProjectWorkflowProgress;
  subjectState: WorkflowSubjectStateRow | null;
  row: Record<string, unknown>;
}): ProjectWorkflowProgress {
  const selectedDefinition = readSelectedWorkflowDefinition(input.row);
  const workflowDefinitionId = input.progress.workflow_definition_id ??
    input.subjectState?.definition_id ??
    selectedDefinition.id ??
    readString(input.row.construction_workflow_definition_id);

  return {
    ...input.progress,
    workflow_definition_id: workflowDefinitionId,
    workflow_title: input.progress.workflow_title ??
      readSubjectStateWorkflowDefinitionName(input.subjectState) ??
      selectedDefinition.name,
  };
}

function buildWorkflowStateSummary(input: {
  projectId: string;
  subjectState: WorkflowSubjectStateRow | null;
  progress: ProjectWorkflowProgress;
}): ProjectWorkflowStateSummary | null {
  if (!input.subjectState && input.progress.source === "missing_runtime") {
    return null;
  }

  return {
    subject_type: "project",
    subject_id: input.projectId,
    instance_id: input.progress.instance_id ?? input.subjectState?.instance_id ??
      null,
    workflow_definition_id: input.progress.workflow_definition_id ??
      input.subjectState?.definition_id ?? null,
    workflow_title: input.progress.workflow_title ?? null,
    instance_status: input.progress.instance_status ??
      input.subjectState?.instance_status ?? null,
    current_node_key: input.progress.current_node_key ??
      input.subjectState?.current_node_key ?? null,
    current_node_title: input.progress.current_node_title ??
      input.subjectState?.current_node_title ?? null,
    current_group_key: input.progress.current_group_key,
    current_group_label: input.progress.current_group_label,
    current_group_order: input.progress.current_group_order,
    current_business_kind: input.progress.current_business_kind ??
      input.subjectState?.current_business_kind ?? null,
    pending_task_count: input.subjectState?.pending_task_count ??
      input.progress.pending_task_count,
    actions: input.progress.actions,
    timeline_nodes: input.progress.timeline_nodes,
  };
}

function readSelectedWorkflowDefinition(row: Record<string, unknown>): {
  id: string | null;
  name: string | null;
} {
  const relation = row.construction_workflow_definition;
  const item = Array.isArray(relation) ? relation[0] : relation;
  if (!item || typeof item !== "object") {
    return { id: null, name: null };
  }

  const record = item as Record<string, unknown>;
  return {
    id: readString(record.id),
    name: readString(record.name),
  };
}

function readSubjectStateWorkflowDefinitionName(
  subjectState: WorkflowSubjectStateRow | null,
): string | null {
  const relation = subjectState?.definition;
  const item = Array.isArray(relation) ? relation[0] : relation;
  if (!item || typeof item !== "object") {
    return null;
  }

  return readString((item as Record<string, unknown>).name);
}

function stripLegacyStageFields(row: Record<string, unknown>): Record<string, unknown> {
  const {
    current_stage: _currentStage,
    current_stage_label: _currentStageLabel,
    stage_code: _stageCode,
    stage_label: _stageLabel,
    current_construction_stage: _currentConstructionStage,
    ...rest
  } = row;

  return rest;
}

function readProjectId(row: Record<string, unknown>): string | null {
  const value = row.id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
