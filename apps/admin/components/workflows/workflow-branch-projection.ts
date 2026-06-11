import {
  getWorkflowEdgeConditionOption,
  WORKFLOW_EDGE_CONDITION_OPTIONS,
  type WorkflowEdgeConditionOption,
  type WorkflowEdgeConditionOptionKey,
} from "@/components/workflows/workflow-edge-conditions";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/components/workflows/workflow-types";

export type WorkflowBranchKind = "payment" | "approval";
export type WorkflowBranchOutcomeKey = Exclude<WorkflowEdgeConditionOptionKey, "always">;

export type WorkflowConnectionSource = {
  nodeId: string;
  branchOutcome?: WorkflowBranchOutcomeKey;
};

export type WorkflowCanvasBranchNode = {
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

export type WorkflowCanvasDisplayEdge = WorkflowEdge & {
  displaySourceNodeId?: string;
  displayTargetNodeId?: string;
  dataSourceNodeKey?: string;
  dataTargetNodeKey?: string;
  readOnly?: boolean;
};

export const WORKFLOW_BRANCH_NODE_WIDTH = 118;
export const WORKFLOW_BRANCH_NODE_HEIGHT = 84;

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

export function buildWorkflowCanvasBranchNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowCanvasBranchNode[] {
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
      position: {
        x: node.position.x + BRANCH_NODE_OFFSET_X,
        y: node.position.y,
      },
      outcomes: getWorkflowBranchOutcomes(kind),
    }];
  });
}

export function buildWorkflowCanvasDisplayEdges(input: {
  edges: WorkflowEdge[];
  branchNodes: WorkflowCanvasBranchNode[];
  nodeById: Map<string, WorkflowNode>;
}): WorkflowCanvasDisplayEdge[] {
  const branchNodeBySourceId = new Map(input.branchNodes.map((node) => [
    node.sourceNodeId,
    node,
  ]));
  const branchLinkEdges = input.branchNodes.map((branchNode) => {
    const sourceNode = input.nodeById.get(branchNode.sourceNodeId);
    const now = new Date().toISOString();
    return {
      id: `branch-link:${branchNode.sourceNodeId}`,
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
      readOnly: true,
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
