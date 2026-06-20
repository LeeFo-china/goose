import type { AuthContext } from "@/services/authorization";
import { buildWorkflowTaskActionPayloads } from "@/services/workflow-task-actions";
import {
  buildWorkflowTaskAssigneeMetadataFromRecord,
  type WorkflowAssigneeEmployee,
} from "@/services/workflow-task-assignee";
import {
  buildWorkflowTimelineNodeContract,
  enrichWorkflowTimelineNodesWithConstructionStages,
  orderWorkflowTimelineGraphNodes,
  type ConstructionStagesForWorkflowTimeline,
  type WorkflowTimelineNode,
} from "@/services/project-workflow-timeline-contract";
import type { WorkflowBusinessKind, WorkflowInstanceStatus } from "@gooes/domain";

type JsonObject = Record<string, unknown>;

export type WorkflowProgressSource =
  | "workflow_runtime"
  | "missing_runtime"
  | "unavailable";

export type ProjectWorkflowProgressGate = {
  type: "payment_collection";
  payment_type: string;
  payment_label: string;
  blocked_stage_code: string | null;
  blocked_stage_label: string | null;
  blocked_reason?: string;
};

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
  instance_status: WorkflowInstanceStatus | null;
  current_node_key: string | null;
  current_node_title: string | null;
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
  status: WorkflowInstanceStatus;
  current_node_key: string | null;
  current_node_snapshot: unknown;
};

type WorkflowProgressGraphNode = {
  id: string;
  node_key: string;
  title: string;
  node_type: string | null;
  business_kind: WorkflowBusinessKind | string | null;
  config: JsonObject;
};

type WorkflowProgressGraphEdge = {
  source_node_id: string;
  target_node_id: string;
};

type WorkflowProgressGraph = {
  nodes: WorkflowProgressGraphNode[];
  edges: WorkflowProgressGraphEdge[];
};

type BuildProjectWorkflowProgressProjectionInput = {
  subjectState: SubjectStateInput | null;
  runtimeInstance: RuntimeInstanceInput | null;
  graph: WorkflowProgressGraph | null;
  completedNodeKeys?: string[];
  pendingActions: Array<Record<string, unknown>>;
};

type GetProjectProgressInput = {
  tenantId: string;
  projectId: string;
  authContext?: AuthContext;
};

const PAYMENT_LABELS: Record<string, string> = {
  deposit: "意向定金",
  stage_1: "开工首付款",
  stage_2: "中期进度款",
  stage_3: "工程尾款",
  add_on: "后期增项款",
};

const STAGE_LABELS: Record<string, string> = {
  demolition: "拆改",
  plumbing_electrical: "水电",
  tiling: "瓦工",
  woodwork: "木工",
  painting: "油工",
  installation: "安装",
  completion: "竣工",
};

export function buildProjectWorkflowProgressProjection(
  input: BuildProjectWorkflowProgressProjectionInput,
): ProjectWorkflowProgress {
  if (!input.runtimeInstance) {
    return missingRuntimeProgress(input.pendingActions);
  }

  const currentNode = resolveCurrentNode(input.runtimeInstance, input.graph);
  const currentNodeKey = input.runtimeInstance.current_node_key;
  const warnings = buildWarnings(input.subjectState, input.runtimeInstance);
  const currentBusinessKind = currentNode.business_kind ??
    input.subjectState?.current_business_kind ?? null;
  const currentNodeTitle = getWorkflowNodeDisplayTitle(currentNode) ??
    input.subjectState?.current_node_title ?? null;
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
    instance_status: input.runtimeInstance.status,
    current_node_key: currentNodeKey,
    current_node_title: currentNodeTitle,
    current_node_type: currentNode.node_type,
    current_business_kind: currentBusinessKind,
    current_stage_code: currentNode.node_type === "procedure"
      ? readString(currentNode.config.stage_key)
      : null,
    current_gate: currentBusinessKind === "payment_collection"
      ? buildPaymentGate(currentNode, input.graph, currentGateBlockedReason)
      : null,
    timeline_nodes: buildWorkflowTimelineNodes({
      graph: input.graph,
      currentNodeKey,
      completedNodeKeys: input.completedNodeKeys ?? [],
      actions: input.pendingActions,
      assignees: input.pendingActions
        .map((action) => ({
          node_key: readString(action.node_key) ?? "",
          ...buildWorkflowTaskAssigneeMetadataFromRecord(action),
        }))
        .filter((assignee) => assignee.node_key && assignee.assignee_employee_id),
    }),
    pending_task_count: input.subjectState?.pending_task_count ??
      input.pendingActions.length,
    actions: input.pendingActions,
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
    const { workflowSubjectStateRepository } = await import(
      "@/repositories/workflow-subject-states"
    );
    const { workflowRepository } = await import("@/repositories/workflows");
    const { workflowTaskRepository } = await import("@/repositories/workflow-tasks");

    const [subjectState, runtimeInstance] = await Promise.all([
      workflowSubjectStateService.getSubjectState({
        tenantId: input.tenantId,
        subjectType: "project",
        subjectId: input.projectId,
      }),
      workflowSubjectStateRepository.findLatestRuntimeInstance({
        tenantId: input.tenantId,
        subjectType: "project",
        subjectId: input.projectId,
      }),
    ]);

    if (!runtimeInstance) {
      return buildProjectWorkflowProgressProjection({
        subjectState,
        runtimeInstance: null,
        graph: null,
        pendingActions: [],
      });
    }

    const [graph, pendingTasks, runtimeNodes] = await Promise.all([
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
    ]);
    const pendingActions = await buildWorkflowTaskActionPayloads({
      tenantId: input.tenantId,
      subjectType: "project",
      tasks: pendingTasks,
    });

    return buildProjectWorkflowProgressProjection({
      subjectState,
      runtimeInstance,
      graph: graph
        ? {
          nodes: graph.nodes,
          edges: graph.edges,
        }
        : null,
      completedNodeKeys: runtimeNodes
        .filter((node) => node.status === "completed")
        .map((node) => node.node_key),
      pendingActions,
    });
  }
}

function missingRuntimeProgress(
  actions: Array<Record<string, unknown>>,
): ProjectWorkflowProgress {
  return {
    source: "missing_runtime",
    instance_id: null,
    instance_status: null,
    current_node_key: null,
    current_node_title: null,
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
    instance_status: null,
    current_node_key: null,
    current_node_title: null,
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
    instance_status: progress.instance_status,
    current_node_key: progress.current_node_key,
    current_node_title: progress.current_node_title,
    current_node_type: progress.current_node_type,
    current_business_kind: progress.current_business_kind,
    current_stage_code: progress.current_stage_code,
    current_gate: progress.current_gate,
    timeline_nodes: progress.timeline_nodes,
    pending_task_count: progress.pending_task_count,
  };
}

export function enrichProjectWorkflowProgressWithConstructionStages(
  progress: ProjectWorkflowProgress,
  constructionStages: ConstructionStagesForWorkflowTimeline | null | undefined,
): ProjectWorkflowProgress {
  return {
    ...progress,
    timeline_nodes: enrichWorkflowTimelineNodesWithConstructionStages(
      progress.timeline_nodes,
      constructionStages,
    ),
  };
}

export function buildWorkflowTimelineNodes(input: {
  graph: WorkflowProgressGraph | null;
  currentNodeKey: string | null;
  completedNodeKeys?: string[];
  actions?: Array<Record<string, unknown>>;
  assignees?: Array<{
    node_key: string;
    assignee_employee_id?: string;
    assignee_employee_name?: string | null;
    assignee_employee?: WorkflowAssigneeEmployee;
  }>;
}): WorkflowTimelineNode[] {
  if (!input.graph) return [];

  const completedNodeKeys = new Set(input.completedNodeKeys ?? []);
  const assigneesByNodeKey = new Map(
    (input.assignees ?? [])
      .filter((assignee) => assignee.node_key && assignee.assignee_employee_id)
      .map((assignee) => [assignee.node_key, assignee]),
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
      return buildWorkflowTimelineNodeContract({
        node: withWorkflowNodeDisplayTitle(node),
        status: resolveTimelineNodeStatus({
          nodeKey: node.node_key,
          currentNodeKey: input.currentNodeKey,
          completedNodeKeys,
        }),
        assignee,
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

function getWorkflowNodeDisplayTitle(
  node: WorkflowProgressGraphNode,
): string | null {
  if (node.business_kind !== "payment_collection") {
    return node.title || null;
  }

  const paymentType = readString(node.config.payment_type);
  return paymentType ? PAYMENT_LABELS[paymentType] ?? node.title : node.title;
}

function buildPaymentGate(
  currentNode: WorkflowProgressGraphNode,
  graph: WorkflowProgressGraph | null,
  blockedReason?: string,
): ProjectWorkflowProgressGate {
  const paymentType = readString(currentNode.config.payment_type) ?? "deposit";
  const nextNode = graph?.edges
    .filter((edge) => edge.source_node_id === currentNode.id)
    .map((edge) =>
      graph.nodes.find((node) => node.id === edge.target_node_id) ?? null
    )
    .find((node): node is WorkflowProgressGraphNode => Boolean(node)) ?? null;
  const blockedStageCode = readString(nextNode?.config.stage_key);

  return {
    type: "payment_collection",
    payment_type: paymentType,
    payment_label: getWorkflowNodeDisplayTitle(currentNode) ?? currentNode.title,
    blocked_stage_code: blockedStageCode,
    blocked_stage_label: blockedStageCode
      ? STAGE_LABELS[blockedStageCode] ?? blockedStageCode
      : null,
    ...(blockedReason ? { blocked_reason: blockedReason } : {}),
  };
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

function asRecord(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

export const projectWorkflowProgressService =
  new ProjectWorkflowProgressService();
