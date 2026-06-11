import type { Connection } from "@xyflow/react";
import {
  getWorkflowBranchOutcomeByEdge,
  getWorkflowBranchSourceKind,
  type WorkflowBranchOutcomeKey,
} from "@/components/workflows/workflow-branch-projection";
import {
  WORKFLOW_FLOW_DECISION_NODE_HEIGHT,
  WORKFLOW_FLOW_DECISION_NODE_WIDTH,
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
export const WORKFLOW_FLOW_EDGE_TYPE = "workflowEdge";
export const WORKFLOW_FLOW_INPUT_HANDLE = "input";
export const WORKFLOW_FLOW_OUTPUT_HANDLE = "output";

export function toWorkflowFlowNodes(input: WorkflowFlowAdapterInput): WorkflowFlowNode[] {
  return input.nodes.map((node) => {
    const isDecisionNode = Boolean(getWorkflowBranchSourceKind(node));
    return {
      id: node.id,
      type: WORKFLOW_FLOW_NODE_TYPE,
      position: node.position,
      width: isDecisionNode ? WORKFLOW_FLOW_DECISION_NODE_WIDTH : WORKFLOW_FLOW_NODE_WIDTH,
      height: isDecisionNode ? WORKFLOW_FLOW_DECISION_NODE_HEIGHT : WORKFLOW_FLOW_NODE_HEIGHT,
      draggable: input.disabled ? false : undefined,
      selectable: input.disabled ? false : undefined,
      data: {
        node,
        connecting: node.id === input.connectingNodeId,
        disabled: input.disabled,
        selected: node.id === input.selectedNodeId,
        validationState: getWorkflowFlowValidationState(node.id, input),
      },
    };
  });
}

type WorkflowFlowEdgeAdapterInput = Pick<
  WorkflowFlowAdapterInput,
  "activeValidationEdgeIds" | "disabled" | "edges" | "nodes" | "onDeleteEdge"
>;

export function toWorkflowFlowEdges(input: WorkflowFlowEdgeAdapterInput): WorkflowFlowEdge[] {
  const flowNodeKeyById = new Map(input.nodes.map((node) => [node.id, node.node_key]));
  return input.edges.map((edge) => {
    const branchOutcome = getWorkflowBranchOutcomeByEdge(edge);
    const pathSourceKey = flowNodeKeyById.get(edge.source_node_id) || edge.source_node_id;
    const pathTargetKey = flowNodeKeyById.get(edge.target_node_id) || edge.target_node_id;
    return {
      id: edge.id,
      type: WORKFLOW_FLOW_EDGE_TYPE,
      source: edge.source_node_id,
      target: edge.target_node_id,
      sourceHandle: branchOutcome || WORKFLOW_FLOW_OUTPUT_HANDLE,
      targetHandle: WORKFLOW_FLOW_INPUT_HANDLE,
      data: {
        edge,
        active: input.activeValidationEdgeIds.has(edge.id),
        actionSourceKey: pathSourceKey,
        actionTargetKey: pathTargetKey,
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
  return {
    nodeId: connection.source,
    branchOutcome: parseWorkflowBranchOutcome(connection.sourceHandle),
  };
}

export function getWorkflowFlowConnectionTarget(connection: Connection) {
  return connection.target || null;
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
