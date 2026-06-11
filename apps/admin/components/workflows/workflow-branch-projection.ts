import {
  getWorkflowEdgeConditionOption,
  WORKFLOW_EDGE_CONDITION_OPTIONS,
  type WorkflowEdgeConditionOption,
  type WorkflowEdgeConditionOptionKey,
} from "@/components/workflows/workflow-edge-conditions";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodePosition,
} from "@/components/workflows/workflow-types";

export type WorkflowBranchKind = "payment" | "approval";
export type WorkflowBranchOutcomeKey = Exclude<WorkflowEdgeConditionOptionKey, "always">;

export type WorkflowConnectionSource = {
  nodeId: string;
  branchOutcome?: WorkflowBranchOutcomeKey;
};

export type WorkflowBranchProjectionNode = {
  id: string;
  node_key: string;
  canvasWidth: number;
  canvasHeight: number;
  sourceNodeId: string;
  sourceNodeKey: string;
  kind: WorkflowBranchKind;
  title: string;
  position: WorkflowNode["position"];
  outcomes: WorkflowBranchOutcome[];
};

export type WorkflowBranchOutcome = {
  key: WorkflowBranchOutcomeKey;
  label: string;
  option: WorkflowEdgeConditionOption;
};

export type WorkflowDisplayEdge = WorkflowEdge & {
  displaySourceNodeId?: string;
  displayTargetNodeId?: string;
  dataSourceNodeKey?: string;
  dataTargetNodeKey?: string;
  readOnly?: boolean;
};

export const WORKFLOW_BRANCH_NODE_WIDTH = 104;
export const WORKFLOW_BRANCH_NODE_HEIGHT = 104;
export const WORKFLOW_BRANCH_LINK_EDGE_PREFIX = "branch-link:";

const BRANCH_NODE_OFFSET_X = 240;

const PAYMENT_OUTCOMES: WorkflowBranchOutcomeKey[] = [
  "payment_success",
  "payment_failed",
];

const APPROVAL_OUTCOMES: WorkflowBranchOutcomeKey[] = [
  "approval_approved",
  "approval_rejected",
];

export function getWorkflowBranchSourceKind(
  node: WorkflowNode,
): WorkflowBranchKind | null {
  if (node.business_kind === "payment_collection") return "payment";
  if (
    node.business_kind === "expense_approval" ||
    ("approval_type" in node.config && Boolean(node.config.approval_type))
  ) {
    return "approval";
  }
  return null;
}

export function getDefaultWorkflowBranchOutcome(
  kind: WorkflowBranchKind,
): WorkflowBranchOutcomeKey {
  return kind === "payment" ? "payment_success" : "approval_approved";
}

export function getWorkflowBranchOutcomeOption(
  outcomeKey: WorkflowBranchOutcomeKey,
): WorkflowEdgeConditionOption {
  return WORKFLOW_EDGE_CONDITION_OPTIONS.find((option) =>
    option.value === outcomeKey
  ) ?? WORKFLOW_EDGE_CONDITION_OPTIONS[0];
}

export function getWorkflowBranchOutcomeByEdge(
  edge: WorkflowEdge,
): WorkflowBranchOutcomeKey | null {
  const option = getWorkflowEdgeConditionOption(edge.condition);
  return option.value === "always" ? null : option.value;
}

export function getWorkflowBranchOutcomePoint(
  branchNode: {
    canvasHeight?: number;
    canvasWidth?: number;
    position: WorkflowNode["position"];
  },
  outcomeKey: WorkflowBranchOutcomeKey,
): WorkflowNodePosition {
  const failure = outcomeKey === "payment_failed" || outcomeKey === "approval_rejected";
  const width = branchNode.canvasWidth ?? WORKFLOW_BRANCH_NODE_WIDTH;
  const height = branchNode.canvasHeight ?? WORKFLOW_BRANCH_NODE_HEIGHT;
  return {
    x: branchNode.position.x + (failure
      ? width / 2
      : width),
    y: branchNode.position.y + (failure
      ? height
      : height / 2),
  };
}

export function buildWorkflowBranchProjectionNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowBranchProjectionNode[] {
  const edgeBySourceId = new Map<string, WorkflowEdge[]>();
  edges.forEach((edge) => {
    edgeBySourceId.set(edge.source_node_id, [
      ...(edgeBySourceId.get(edge.source_node_id) || []),
      edge,
    ]);
  });

  return nodes.flatMap((node) => {
    const kind = getWorkflowBranchSourceKind(node);
    if (!kind) return [];
    const hasBranchEdge = (edgeBySourceId.get(node.id) || [])
      .some((edge) => {
        const outcome = getWorkflowBranchOutcomeByEdge(edge);
        return Boolean(outcome && isWorkflowBranchOutcomeForKind(kind, outcome));
      });
    if (!hasBranchEdge) return [];

    return [{
      id: getWorkflowBranchNodeId(node.id),
      node_key: getWorkflowBranchNodeId(node.id),
      canvasWidth: WORKFLOW_BRANCH_NODE_WIDTH,
      canvasHeight: WORKFLOW_BRANCH_NODE_HEIGHT,
      sourceNodeId: node.id,
      sourceNodeKey: node.node_key,
      kind,
      title: kind === "payment" ? "收款判断" : "审批判断",
      position: getWorkflowBranchNodePosition(node) || {
        x: node.position.x + BRANCH_NODE_OFFSET_X,
        y: node.position.y,
      },
      outcomes: getWorkflowBranchOutcomes(kind),
    }];
  });
}

export function buildWorkflowDisplayEdges(input: {
  edges: WorkflowEdge[];
  branchNodes: WorkflowBranchProjectionNode[];
  nodeById: Map<string, WorkflowNode>;
}): WorkflowDisplayEdge[] {
  const branchNodeBySourceId = new Map(input.branchNodes.map((node) => [
    node.sourceNodeId,
    node,
  ]));
  const branchLinkEdges = input.branchNodes.map((branchNode) => {
    const sourceNode = input.nodeById.get(branchNode.sourceNodeId);
    const now = new Date().toISOString();
    return {
      id: getWorkflowBranchLinkEdgeId(branchNode.sourceNodeId),
      tenant_id: sourceNode?.tenant_id || "",
      definition_id: sourceNode?.definition_id || "",
      source_node_id: branchNode.sourceNodeId,
      target_node_id: branchNode.id,
      label: null,
      condition: { operator: "always" as const },
      priority: 0,
      created_at: now,
      updated_at: now,
      dataSourceNodeKey: branchNode.sourceNodeKey,
      dataTargetNodeKey: branchNode.id,
    };
  });

  const displayEdges = input.edges.map((edge) => {
    const branchNode = branchNodeBySourceId.get(edge.source_node_id);
    const outcome = getWorkflowBranchOutcomeByEdge(edge);
    if (!branchNode || !outcome || !isWorkflowBranchOutcomeForKind(branchNode.kind, outcome)) {
      return edge;
    }

    return {
      ...edge,
      displaySourceNodeId: branchNode.id,
      dataSourceNodeKey: branchNode.sourceNodeKey,
    };
  });

  return [...branchLinkEdges, ...displayEdges];
}

export function getWorkflowBranchNodeId(sourceNodeId: string) {
  return `branch:${sourceNodeId}`;
}

export function getWorkflowBranchLinkEdgeId(sourceNodeId: string) {
  return `${WORKFLOW_BRANCH_LINK_EDGE_PREFIX}${sourceNodeId}`;
}

export function isWorkflowBranchLinkEdgeId(edgeId: string) {
  return edgeId.startsWith(WORKFLOW_BRANCH_LINK_EDGE_PREFIX);
}

export function getWorkflowBranchLinkSourceNodeId(edgeId: string) {
  return isWorkflowBranchLinkEdgeId(edgeId)
    ? edgeId.slice(WORKFLOW_BRANCH_LINK_EDGE_PREFIX.length)
    : null;
}

export function getWorkflowBranchNodePosition(node: WorkflowNode) {
  const position = node.config.branch_node_position;
  return position &&
      Number.isFinite(position.x) &&
      Number.isFinite(position.y)
    ? position
    : null;
}

export function withWorkflowBranchNodePosition(
  node: WorkflowNode,
  position: WorkflowNode["position"] | null,
): WorkflowNode {
  return {
    ...node,
    config: {
      ...node.config,
      branch_node_position: position,
    },
  };
}

export function isWorkflowBranchEdgeForNode(node: WorkflowNode, edge: WorkflowEdge) {
  if (edge.source_node_id !== node.id) return false;
  const kind = getWorkflowBranchSourceKind(node);
  const outcome = getWorkflowBranchOutcomeByEdge(edge);
  return Boolean(kind && outcome && isWorkflowBranchOutcomeForKind(kind, outcome));
}

function getWorkflowBranchOutcomes(kind: WorkflowBranchKind): WorkflowBranchOutcome[] {
  const outcomeKeys = kind === "payment" ? PAYMENT_OUTCOMES : APPROVAL_OUTCOMES;
  return outcomeKeys.map((key) => ({
    key,
    label: getWorkflowBranchOutcomeOption(key).label
      .replace("收款", "")
      .replace("审批", ""),
    option: getWorkflowBranchOutcomeOption(key),
  }));
}

function isWorkflowBranchOutcomeForKind(
  kind: WorkflowBranchKind,
  outcome: WorkflowBranchOutcomeKey,
) {
  const outcomes = kind === "payment" ? PAYMENT_OUTCOMES : APPROVAL_OUTCOMES;
  return outcomes.includes(outcome);
}
