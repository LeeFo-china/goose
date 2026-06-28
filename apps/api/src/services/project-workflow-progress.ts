import {
  buildFinanceConfirmationActorsForTenant,
  enrichWorkflowGraphWithFinanceReviewersForTenant,
  type WorkflowFinanceReviewerGraph,
  type WorkflowFinanceReviewerGraphNode,
} from "@/services/project-workflow-finance-reviewer";
import { buildWorkflowTaskActionPayloads } from "@/services/workflow-task-actions";
import {
  buildWorkflowTaskAssigneeMetadataFromRecord,
  type WorkflowAssigneeEmployee,
} from "@/services/workflow-task-assignee";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments";
import {
  buildProjectWorkflowPaymentGate,
  getWorkflowNodeDisplayTitle,
  type ProjectWorkflowProgressGate,
} from "@/services/project-workflow-progress-labels";
import {
  buildWorkflowTimelineNodeContract,
  buildWorkflowTimelineNodeGroup,
  enrichWorkflowTimelineNodesWithConstructionStages,
  orderWorkflowTimelineGraphNodes,
  type ConstructionStagesForWorkflowTimeline,
  type WorkflowTimelineNode,
  type WorkflowTimelineNodeCompletion,
  type WorkflowTimelineNodeGroup,
} from "@/services/project-workflow-timeline-contract";
import { buildMissingProjectWorkflowProgress } from "@/services/project-workflow-progress-empty";
import {
  FINAL_ACCEPTANCE_STAGE_CODE,
  isFinalAcceptanceReportWorkflowNode,
} from "@/services/project-final-acceptance-workflow";
import type { WorkflowBusinessKind, WorkflowInstanceStatus } from "@gooes/domain";

export {
  buildUnavailableProjectWorkflowProgress,
  toCustomerProjectWorkflowProgress,
} from "@/services/project-workflow-progress-empty";

type JsonObject = Record<string, unknown>;

export type WorkflowProgressSource =
  | "workflow_runtime"
  | "missing_runtime"
  | "unavailable";

export type ProjectWorkflowProgressWarning = {
  code: "STALE_SUBJECT_STATE";
  message: string;
};

export type {
  WorkflowTimelineNode,
  WorkflowTimelineNodeAction,
  WorkflowTimelineNodeAttributes,
  WorkflowTimelineNodeDisplay,
} from "@/services/project-workflow-timeline-contract";
export { enrichWorkflowTimelineNodesWithConstructionStages };

export type ProjectWorkflowProgress = {
  source: WorkflowProgressSource;
  instance_id: string | null;
  workflow_definition_id?: string | null;
  workflow_title?: string | null;
  instance_status: WorkflowInstanceStatus | null;
  current_node_key: string | null;
  current_node_title: string | null;
  current_group_key: string | null;
  current_group_label: string | null;
  current_group_order: number | null;
  current_node_type: string | null;
  current_business_kind: WorkflowBusinessKind | string | null;
  current_stage_code: string | null;
  current_gate: ProjectWorkflowProgressGate | null;
  timeline_nodes: WorkflowTimelineNode[];
  pending_task_count: number;
  actions: Array<Record<string, unknown>>;
  warnings: ProjectWorkflowProgressWarning[];
};

export type CustomerProjectWorkflowProgress = Omit<
  ProjectWorkflowProgress,
  "actions" | "warnings"
>;

type SubjectStateInput = {
  instance_id: string | null;
  instance_status: WorkflowInstanceStatus | null;
  current_node_key: string | null;
  current_node_title: string | null;
  current_business_kind: WorkflowBusinessKind | string | null;
  pending_task_count: number;
};

type RuntimeInstanceInput = {
  id: string;
  definition_id?: string | null;
  status: WorkflowInstanceStatus;
  current_node_key: string | null;
  current_node_snapshot: unknown;
};

type WorkflowProgressGraphNode = WorkflowFinanceReviewerGraphNode;
type WorkflowProgressGraph = WorkflowFinanceReviewerGraph;

type BuildProjectWorkflowProgressProjectionInput = {
  subjectState: SubjectStateInput | null;
  runtimeInstance: RuntimeInstanceInput | null;
  graph: WorkflowProgressGraph | null;
  completedNodeKeys?: string[];
  completedNodeActors?: WorkflowTimelineNodeCompletion[];
  procedureAssignments?: ProcedureAssignmentRow[];
  tenantToday?: string;
  pendingActions: Array<Record<string, unknown>>;
};

type GetProjectProgressInput = {
  tenantId: string;
  projectId: string;
};

export function buildProjectWorkflowProgressProjection(
  input: BuildProjectWorkflowProgressProjectionInput,
): ProjectWorkflowProgress {
  if (!input.runtimeInstance) {
    return buildMissingProjectWorkflowProgress(input.pendingActions);
  }

  const currentNode = resolveCurrentNode(input.runtimeInstance, input.graph);
  const currentNodeKey = input.runtimeInstance.current_node_key;
  const warnings = buildWarnings(input.subjectState, input.runtimeInstance);
  const currentBusinessKind = currentNode.business_kind ??
    input.subjectState?.current_business_kind ?? null;
  const currentNodeTitle = getWorkflowNodeDisplayTitle(currentNode) ??
    input.subjectState?.current_node_title ?? null;
  const timelineNodes = buildWorkflowTimelineNodes({
    graph: input.graph,
    currentNodeKey,
    completedNodeKeys: input.completedNodeKeys ?? [],
    completedNodeActors: input.completedNodeActors ?? [],
    actions: input.pendingActions,
    procedureAssignments: input.procedureAssignments,
    tenantToday: input.tenantToday,
    assignees: input.pendingActions
      .map((action) => ({
        node_key: readString(action.node_key) ?? "",
        ...buildWorkflowTaskAssigneeMetadataFromRecord(action),
      }))
      .filter((assignee) => assignee.node_key && assignee.assignee_employee_id),
  });
  const currentTimelineActions = currentNodeKey
    ? timelineNodes.find((node) => node.node_key === currentNodeKey)?.actions
    : undefined;
  const currentGroup = resolveCurrentTimelineNodeGroup({
    graph: input.graph,
    timelineNodes,
    currentNodeKey,
  });
  const currentGateBlockedReason = currentNodeKey
    ? input.pendingActions
      .filter((action) => readString(action.node_key) === currentNodeKey)
      .map((action) =>
        readString(action.blocked_reason) ?? readString(action.disabled_reason)
      )
      .find((reason): reason is string => Boolean(reason))
    : undefined;

  return {
    source: "workflow_runtime",
    instance_id: input.runtimeInstance.id,
    workflow_definition_id: input.runtimeInstance.definition_id ?? null,
    workflow_title: input.graph?.definition?.name ?? null,
    instance_status: input.runtimeInstance.status,
    current_node_key: currentNodeKey,
    current_node_title: currentNodeTitle,
    current_group_key: currentGroup?.key ?? null,
    current_group_label: currentGroup?.label ?? null,
    current_group_order: currentGroup?.order ?? null,
    current_node_type: currentNode.node_type,
    current_business_kind: currentBusinessKind,
    current_stage_code: resolveCurrentStageCode(currentNode),
    current_gate: currentBusinessKind === "payment_collection"
      ? buildProjectWorkflowPaymentGate(
        currentNode,
        input.graph,
        currentGateBlockedReason,
      )
      : null,
    timeline_nodes: timelineNodes,
    pending_task_count: input.subjectState?.pending_task_count ??
      input.pendingActions.length,
    actions: currentTimelineActions ?? input.pendingActions,
    warnings,
  };
}

class ProjectWorkflowProgressService {
  async getProjectProgress(
    input: GetProjectProgressInput,
  ): Promise<ProjectWorkflowProgress> {
    const { workflowSubjectStateService } = await import(
      "@/services/workflow-subject-state"
    );
    const { workflowRepository } = await import("@/repositories/workflows");
    const { workflowTaskRepository } = await import("@/repositories/workflow-tasks");
    const { projectProcedureAssignmentService } = await import(
      "@/services/project-procedure-assignments"
    );

    const { subjectState, runtimeInstance } =
      await workflowSubjectStateService.getSubjectStateWithRuntime({
        tenantId: input.tenantId,
        subjectType: "project",
        subjectId: input.projectId,
      });

    if (!runtimeInstance) {
      return buildProjectWorkflowProgressProjection({
        subjectState,
        runtimeInstance: null,
        graph: null,
        pendingActions: [],
      });
    }

    const [graph, pendingTasks, runtimeNodes, procedureAssignments] = await Promise.all([
      workflowRepository.getGraph({
        tenantId: input.tenantId,
        definitionId: runtimeInstance.definition_id,
        versionId: runtimeInstance.version_id,
      }),
      workflowTaskRepository.listPendingByInstance({
        tenantId: input.tenantId,
        instanceId: runtimeInstance.id,
      }),
      workflowRepository.listRuntimeInstanceNodes({
        tenantId: input.tenantId,
        definitionId: runtimeInstance.definition_id,
        instanceId: runtimeInstance.id,
      }),
      projectProcedureAssignmentService.listProjectAssignmentsForRuntime({
        tenantId: input.tenantId,
        projectId: input.projectId,
        workflowInstanceId: runtimeInstance.id,
      }),
    ]);
    const workflowGraph = graph
      ? {
        nodes: graph.nodes,
        edges: graph.edges,
        definition: graph.definition,
      }
      : null;
    const [pendingActions, enrichedGraph, completedNodeActors] =
      await Promise.all([
        buildWorkflowTaskActionPayloads({
          tenantId: input.tenantId,
          subjectType: "project",
          tasks: pendingTasks,
        }),
        enrichWorkflowGraphWithFinanceReviewersForTenant({
          tenantId: input.tenantId,
          graph: workflowGraph,
        }),
        buildFinanceConfirmationActorsForTenant({
          tenantId: input.tenantId,
          runtimeNodes,
        }),
      ]);

    return buildProjectWorkflowProgressProjection({
      subjectState,
      runtimeInstance,
      graph: enrichedGraph,
      completedNodeKeys: runtimeNodes
        .filter((node) => node.status === "completed")
        .map((node) => node.node_key),
      completedNodeActors,
      procedureAssignments,
      pendingActions,
    });
  }
}

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

export function buildWorkflowTimelineNodes(input: {
  graph: WorkflowProgressGraph | null;
  currentNodeKey: string | null;
  completedNodeKeys?: string[];
  completedNodeActors?: WorkflowTimelineNodeCompletion[];
  actions?: Array<Record<string, unknown>>;
  procedureAssignments?: ProcedureAssignmentRow[];
  tenantToday?: string;
  assignees?: Array<{
    node_key: string;
    assignee_employee_id?: string;
    assignee_employee_name?: string | null;
    assignee_employee?: WorkflowAssigneeEmployee;
  }>;
}): WorkflowTimelineNode[] {
  if (!input.graph) return [];

  const group = resolveWorkflowGraphGroup(input.graph);
  const completedNodeKeys = new Set(input.completedNodeKeys ?? []);
  const completionsByNodeKey = new Map(
    (input.completedNodeActors ?? [])
      .filter((completion) =>
        completion.node_key && completion.completed_by_employee_id
      )
      .map((completion) => [completion.node_key, completion]),
  );
  const assigneesByNodeKey = new Map(
    (input.assignees ?? [])
      .filter((assignee) => assignee.node_key && assignee.assignee_employee_id)
      .map((assignee) => [assignee.node_key, assignee]),
  );
  const procedureAssignmentsByNodeKey = new Map(
    (input.procedureAssignments ?? [])
      .filter((assignment) => assignment.node_key)
      .map((assignment) => [assignment.node_key, assignment]),
  );
  const actionsByNodeKey = new Map<string, Array<Record<string, unknown>>>();
  for (const action of input.actions ?? []) {
    const nodeKey = readString(action.node_key);
    if (!nodeKey) continue;
    actionsByNodeKey.set(nodeKey, [
      ...(actionsByNodeKey.get(nodeKey) ?? []),
      action,
    ]);
  }
  return orderWorkflowTimelineGraphNodes(input.graph)
    .filter((node) => node.node_type !== "start" && node.node_type !== "end")
    .map((node) => {
      const assignee = assigneesByNodeKey.get(node.node_key);
      const completion = completionsByNodeKey.get(node.node_key);
      return buildWorkflowTimelineNodeContract({
        node: withWorkflowNodeDisplayTitle(node),
        status: resolveTimelineNodeStatus({
          nodeKey: node.node_key,
          currentNodeKey: input.currentNodeKey,
          completedNodeKeys,
        }),
        group,
        assignee,
        completion,
        procedureAssignment: procedureAssignmentsByNodeKey.get(node.node_key),
        tenantToday: input.tenantToday,
        actions: actionsByNodeKey.get(node.node_key) ?? [],
      });
    });
}

function resolveCurrentNode(
  runtimeInstance: RuntimeInstanceInput,
  graph: WorkflowProgressGraph | null,
): WorkflowProgressGraphNode {
  const snapshot = asRecord(runtimeInstance.current_node_snapshot);
  const graphNode = graph?.nodes.find((node) =>
    node.node_key === runtimeInstance.current_node_key
  );

  return {
    id: readString(snapshot.id) ?? graphNode?.id ?? "",
    node_key: readString(snapshot.node_key) ?? graphNode?.node_key ??
      runtimeInstance.current_node_key ?? "",
    title: readString(snapshot.title) ?? graphNode?.title ?? "",
    node_type: readString(snapshot.node_type) ?? graphNode?.node_type ?? null,
    business_kind: readString(snapshot.business_kind) ?? graphNode?.business_kind ??
      null,
    config: asRecord(snapshot.config) ?? graphNode?.config ?? {},
  };
}

function withWorkflowNodeDisplayTitle(
  node: WorkflowProgressGraphNode,
): WorkflowProgressGraphNode {
  const displayTitle = getWorkflowNodeDisplayTitle(node);
  return displayTitle && displayTitle !== node.title
    ? { ...node, title: displayTitle }
    : node;
}

function resolveCurrentTimelineNodeGroup(input: {
  graph: WorkflowProgressGraph | null;
  timelineNodes: WorkflowTimelineNode[];
  currentNodeKey: string | null;
}): WorkflowTimelineNodeGroup | null {
  if (input.currentNodeKey) {
    const currentTimelineNode = input.timelineNodes.find((node) =>
      node.node_key === input.currentNodeKey
    );
    if (currentTimelineNode) return currentTimelineNode.group;
  }

  return input.graph ? resolveWorkflowGraphGroup(input.graph) : null;
}

function resolveWorkflowGraphGroup(
  graph: WorkflowProgressGraph,
): WorkflowTimelineNodeGroup {
  return buildWorkflowTimelineNodeGroup(graph.definition?.category ?? null);
}

function resolveTimelineNodeStatus(input: {
  nodeKey: string;
  currentNodeKey: string | null;
  completedNodeKeys: Set<string>;
}): WorkflowTimelineNode["status"] {
  if (input.currentNodeKey && input.nodeKey === input.currentNodeKey) {
    return "current";
  }
  if (input.completedNodeKeys.has(input.nodeKey)) {
    return "done";
  }
  return "pending";
}

function buildWarnings(
  subjectState: SubjectStateInput | null,
  runtimeInstance: RuntimeInstanceInput,
): ProjectWorkflowProgressWarning[] {
  if (
    subjectState?.current_node_key &&
    subjectState.current_node_key !== runtimeInstance.current_node_key
  ) {
    return [{
      code: "STALE_SUBJECT_STATE",
      message: "workflow_subject_states 与 workflow_instances 当前节点不一致",
    }];
  }

  return [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveCurrentStageCode(node: WorkflowProgressGraphNode) {
  if (node.node_type === "procedure") {
    return readString(node.config.stage_key);
  }

  if (isFinalAcceptanceReportWorkflowNode(node)) {
    return FINAL_ACCEPTANCE_STAGE_CODE;
  }

  return null;
}

function asRecord(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

export const projectWorkflowProgressService = new ProjectWorkflowProgressService();
