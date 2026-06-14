import type { AuthContext } from "@/services/authorization";
import { buildWorkflowTaskActions } from "@/services/workflow-task-action-metadata";
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
};

export type ProjectWorkflowProgressWarning = {
  code: "STALE_SUBJECT_STATE";
  message: string;
};

export type WorkflowTimelineNode = {
  node_key: string;
  node_title: string;
  node_type: string | null;
  business_kind: WorkflowBusinessKind | string | null;
  status: "done" | "current" | "pending" | "blocked";
};

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

  return {
    source: "workflow_runtime",
    instance_id: input.runtimeInstance.id,
    instance_status: input.runtimeInstance.status,
    current_node_key: currentNodeKey,
    current_node_title: currentNode.title ?? input.subjectState?.current_node_title ?? null,
    current_node_type: currentNode.node_type,
    current_business_kind: currentBusinessKind,
    current_stage_code: currentNode.node_type === "procedure"
      ? readString(currentNode.config.stage_key)
      : null,
    current_gate: currentBusinessKind === "payment_collection"
      ? buildPaymentGate(currentNode, input.graph)
      : null,
    timeline_nodes: buildWorkflowTimelineNodes({
      graph: input.graph,
      currentNodeKey,
      completedNodeKeys: input.completedNodeKeys ?? [],
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

    const subjectState = await workflowSubjectStateService.getSubjectState({
      tenantId: input.tenantId,
      subjectType: "project",
      subjectId: input.projectId,
    });
    const runtimeInstance = await workflowSubjectStateRepository
      .findLatestRuntimeInstance({
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
      pendingActions: pendingTasks.flatMap((task) =>
        buildWorkflowTaskActions({
          subjectType: "project",
          nodeKey: task.node_key,
          nodeType: task.node_type,
          taskTitle: task.title,
          currentNodeSnapshot: runtimeInstance.current_node_snapshot,
        }).map((action) => ({
          ...action,
          task_id: task.id,
          node_key: task.node_key,
          node_type: task.node_type,
          disabled: false,
        }))
      ),
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

export function buildWorkflowTimelineNodes(input: {
  graph: WorkflowProgressGraph | null;
  currentNodeKey: string | null;
  completedNodeKeys?: string[];
}): WorkflowTimelineNode[] {
  if (!input.graph) return [];

  const completedNodeKeys = new Set(input.completedNodeKeys ?? []);
  return orderWorkflowTimelineGraphNodes(input.graph)
    .filter((node) => node.node_type !== "start" && node.node_type !== "end")
    .map((node) => ({
      node_key: node.node_key,
      node_title: node.title,
      node_type: node.node_type,
      business_kind: node.business_kind,
      status: resolveTimelineNodeStatus({
        nodeKey: node.node_key,
        currentNodeKey: input.currentNodeKey,
        completedNodeKeys,
      }),
    }));
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

function buildPaymentGate(
  currentNode: WorkflowProgressGraphNode,
  graph: WorkflowProgressGraph | null,
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
    payment_label: PAYMENT_LABELS[paymentType] ?? currentNode.title,
    blocked_stage_code: blockedStageCode,
    blocked_stage_label: blockedStageCode
      ? STAGE_LABELS[blockedStageCode] ?? blockedStageCode
      : null,
  };
}

function orderWorkflowTimelineGraphNodes(
  graph: WorkflowProgressGraph,
): WorkflowProgressGraphNode[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingIds = new Set(graph.edges.map((edge) => edge.target_node_id));
  const outgoingEdges = new Map<string, WorkflowProgressGraphEdge[]>();

  for (const edge of graph.edges) {
    const edges = outgoingEdges.get(edge.source_node_id) ?? [];
    edges.push(edge);
    outgoingEdges.set(edge.source_node_id, edges);
  }

  const explicitStartNodes = graph.nodes.filter((node) => node.node_type === "start");
  const inferredStartNodes = graph.nodes.filter((node) => !incomingIds.has(node.id));
  const startNodes = explicitStartNodes.length > 0
    ? explicitStartNodes
    : inferredStartNodes.length > 0
      ? inferredStartNodes
      : graph.nodes;
  const ordered: WorkflowProgressGraphNode[] = [];
  const visitedNodeIds = new Set<string>();

  const visit = (node: WorkflowProgressGraphNode) => {
    if (visitedNodeIds.has(node.id)) return;
    visitedNodeIds.add(node.id);
    ordered.push(node);

    for (const edge of outgoingEdges.get(node.id) ?? []) {
      const targetNode = nodeById.get(edge.target_node_id);
      if (targetNode) visit(targetNode);
    }
  };

  for (const node of startNodes) {
    visit(node);
  }

  if (explicitStartNodes.length === 0 && inferredStartNodes.length === 0) {
    for (const node of graph.nodes) {
      visit(node);
    }
  }

  return ordered;
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
