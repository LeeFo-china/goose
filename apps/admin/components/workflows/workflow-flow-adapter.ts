import type { Connection, NodeChange, NodePositionChange } from "@xyflow/react";
import {
  buildWorkflowBranchProjectionNodes,
  buildWorkflowDisplayEdges,
  getWorkflowBranchLinkSourceNodeId,
  getWorkflowBranchNodeId,
  getWorkflowBranchOutcomeByEdge,
  type WorkflowBranchOutcomeKey,
} from "@/components/workflows/workflow-branch-projection";
import {
  WORKFLOW_FLOW_BRANCH_NODE_HEIGHT,
  WORKFLOW_FLOW_BRANCH_NODE_WIDTH,
  WORKFLOW_FLOW_NODE_HEIGHT,
  WORKFLOW_FLOW_NODE_WIDTH,
  type WorkflowFlowAdapterInput,
  type WorkflowFlowConnectionSource,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
  type WorkflowFlowValidationState,
} from "@/components/workflows/workflow-flow-types";
import type { WorkflowNode } from "@/components/workflows/workflow-types";

export const WORKFLOW_FLOW_NODE_TYPE = "workflowNode";
export const WORKFLOW_FLOW_BRANCH_NODE_TYPE = "workflowBranch";
export const WORKFLOW_FLOW_EDGE_TYPE = "workflowEdge";
export const WORKFLOW_FLOW_INPUT_HANDLE = "input";
export const WORKFLOW_FLOW_OUTPUT_HANDLE = "output";
export const WORKFLOW_FLOW_BRANCH_TARGET_HANDLE = "branch-input";

export type WorkflowFlowPositionChange =
  | {
    kind: "node";
    nodeId: string;
    position: { x: number; y: number };
  }
  | {
    kind: "branch";
    sourceNodeId: string;
    position: { x: number; y: number };
  };

export function toWorkflowFlowNodes(input: WorkflowFlowAdapterInput): WorkflowFlowNode[] {
  const branchNodes = buildWorkflowBranchProjectionNodes(input.nodes, input.edges);
  const ordinaryNodes: WorkflowFlowNode[] = input.nodes.map((node) => ({
    id: node.id,
    type: WORKFLOW_FLOW_NODE_TYPE,
    position: node.position,
    width: WORKFLOW_FLOW_NODE_WIDTH,
    height: WORKFLOW_FLOW_NODE_HEIGHT,
    draggable: input.disabled ? false : undefined,
    selectable: input.disabled ? false : undefined,
    data: {
      node,
      connecting: node.id === input.connectingNodeId,
      disabled: input.disabled,
      selected: node.id === input.selectedNodeId,
      validationState: getWorkflowFlowValidationState(node.id, input),
    },
  }));
  const branchFlowNodes: WorkflowFlowNode[] = branchNodes.map((branchNode) => ({
    id: branchNode.id,
    type: WORKFLOW_FLOW_BRANCH_NODE_TYPE,
    position: branchNode.position,
    width: WORKFLOW_FLOW_BRANCH_NODE_WIDTH,
    height: WORKFLOW_FLOW_BRANCH_NODE_HEIGHT,
    draggable: input.disabled ? false : undefined,
    selectable: input.disabled ? false : undefined,
    data: {
      branchNode,
      connecting: branchNode.sourceNodeId === input.connectingNodeId,
      disabled: input.disabled,
    },
  }));

  return [...ordinaryNodes, ...branchFlowNodes];
}

export function toWorkflowFlowEdges(input: WorkflowFlowAdapterInput): WorkflowFlowEdge[] {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const branchNodeById = new Map(
    buildWorkflowBranchProjectionNodes(input.nodes, input.edges).map((node) => [node.id, node]),
  );
  const flowNodeKeyById = new Map<string, string>([
    ...input.nodes.map((node) => [node.id, node.node_key] as const),
    ...Array.from(branchNodeById.values()).map((node) => [node.id, node.node_key] as const),
  ]);
  return buildWorkflowDisplayEdges({
    edges: input.edges,
    branchNodes: Array.from(branchNodeById.values()),
    nodeById,
  }).map((edge) => {
    const branchSource = edge.displaySourceNodeId
      ? branchNodeById.get(edge.displaySourceNodeId)
      : null;
    const branchOutcome = branchSource ? getWorkflowBranchOutcomeByEdge(edge) : null;
    const branchLinkSourceNodeId = getWorkflowBranchLinkSourceNodeId(edge.id);
    const source = edge.displaySourceNodeId || edge.source_node_id;
    const target = edge.displayTargetNodeId || edge.target_node_id;
    const pathSourceKey = flowNodeKeyById.get(source) || source;
    const pathTargetKey = flowNodeKeyById.get(target) || target;
    return {
      id: edge.id,
      type: WORKFLOW_FLOW_EDGE_TYPE,
      source,
      target,
      sourceHandle: branchOutcome || WORKFLOW_FLOW_OUTPUT_HANDLE,
      targetHandle: branchLinkSourceNodeId
        ? WORKFLOW_FLOW_BRANCH_TARGET_HANDLE
        : WORKFLOW_FLOW_INPUT_HANDLE,
      data: {
        edge,
        active: input.activeValidationEdgeIds.has(edge.id),
        actionSourceKey: edge.dataSourceNodeKey || pathSourceKey,
        actionTargetKey: edge.dataTargetNodeKey || pathTargetKey,
        disabled: input.disabled,
        onDeleteEdge: input.onDeleteEdge,
        pathSourceKey,
        pathTargetKey,
      },
    };
  });
}

export function getWorkflowFlowConnectionSource(
  connection: Connection,
): WorkflowFlowConnectionSource | null {
  if (!connection.source) return null;
  if (connection.source.startsWith("branch:")) {
    return {
      nodeId: connection.source.slice("branch:".length),
      branchOutcome: parseWorkflowBranchOutcome(connection.sourceHandle),
    };
  }
  return { nodeId: connection.source };
}

export function getWorkflowFlowConnectionTarget(connection: Connection) {
  return connection.target || null;
}

export function getWorkflowNodePositionChanges(
  changes: NodeChange<WorkflowFlowNode>[],
  nodes: WorkflowNode[],
): WorkflowFlowPositionChange[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return changes.flatMap<WorkflowFlowPositionChange>((change) => {
    if (!isNodePositionChange(change) || !change.position) return [];
    if (change.id.startsWith("branch:")) {
      return [{
        kind: "branch" as const,
        sourceNodeId: change.id.slice("branch:".length),
        position: change.position,
      }];
    }
    if (!nodeIds.has(change.id)) return [];
    return [{
      kind: "node" as const,
      nodeId: change.id,
      position: change.position,
    }];
  });
}

export function getWorkflowFlowBranchNodeId(sourceNodeId: string) {
  return getWorkflowBranchNodeId(sourceNodeId);
}

function getWorkflowFlowValidationState(
  nodeId: string,
  input: Pick<
    WorkflowFlowAdapterInput,
    "activeValidationNodeIds" | "errorValidationNodeIds" | "successValidationNodeIds"
  >,
): WorkflowFlowValidationState {
  if (input.activeValidationNodeIds.has(nodeId)) return "active";
  if (input.errorValidationNodeIds.has(nodeId)) return "error";
  if (input.successValidationNodeIds.has(nodeId)) return "success";
  return "idle";
}

function parseWorkflowBranchOutcome(
  handleId: string | null | undefined,
): WorkflowBranchOutcomeKey | undefined {
  if (
    handleId === "payment_success" ||
    handleId === "payment_failed" ||
    handleId === "approval_approved" ||
    handleId === "approval_rejected"
  ) {
    return handleId;
  }
  return undefined;
}

function isNodePositionChange(
  change: NodeChange<WorkflowFlowNode>,
): change is NodePositionChange {
  return change.type === "position";
}
