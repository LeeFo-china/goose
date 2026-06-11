import type { Edge, Node } from "@xyflow/react";
import type {
  WorkflowBranchOutcomeKey,
  WorkflowBranchProjectionNode,
  WorkflowDisplayEdge,
} from "@/components/workflows/workflow-branch-projection";
import type { WorkflowValidationPlaybackSnapshot } from "@/components/workflows/workflow-validation-playback";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";

export const WORKFLOW_FLOW_NODE_WIDTH = 210;
export const WORKFLOW_FLOW_NODE_HEIGHT = 84;
export const WORKFLOW_FLOW_BRANCH_NODE_WIDTH = 118;
export const WORKFLOW_FLOW_BRANCH_NODE_HEIGHT = 84;
export const WORKFLOW_FLOW_ARRANGE_ZOOM = 0.6;
export const WORKFLOW_FLOW_MIN_ZOOM = 0.5;
export const WORKFLOW_FLOW_MAX_ZOOM = 1.8;
export const WORKFLOW_FLOW_ZOOM_STEP = 0.1;

export type WorkflowFlowValidationState = "idle" | "active" | "success" | "error";

export type WorkflowFlowNodeData = {
  node: WorkflowNode;
  connecting: boolean;
  disabled?: boolean;
  selected: boolean;
  validationState: WorkflowFlowValidationState;
};

export type WorkflowFlowBranchNodeData = {
  branchNode: WorkflowBranchProjectionNode;
  connecting: boolean;
  disabled?: boolean;
};

export type WorkflowFlowEdgeData = {
  edge: WorkflowDisplayEdge;
  active: boolean;
  actionSourceKey: string;
  actionTargetKey: string;
  disabled?: boolean;
  onDeleteEdge: (edgeId: string) => void;
  pathSourceKey: string;
  pathTargetKey: string;
};

export type WorkflowFlowNode =
  | Node<WorkflowFlowNodeData, "workflowNode">
  | Node<WorkflowFlowBranchNodeData, "workflowBranch">;

export type WorkflowFlowEdge = Edge<WorkflowFlowEdgeData, "workflowEdge">;

export type WorkflowFlowConnectionSource = {
  nodeId: string;
  branchOutcome?: WorkflowBranchOutcomeKey;
};

export type WorkflowFlowAdapterInput = {
  activeValidationEdgeIds: Set<string>;
  disabled?: boolean;
  edges: WorkflowEdge[];
  errorValidationNodeIds: Set<string>;
  nodes: WorkflowNode[];
  onDeleteEdge: (edgeId: string) => void;
  selectedNodeId: string | null;
  connectingNodeId: string | null;
  successValidationNodeIds: Set<string>;
  activeValidationNodeIds: Set<string>;
};

export type WorkflowFlowPlaybackInput = Pick<
  WorkflowValidationPlaybackSnapshot,
  "activeNodeIds" | "activeEdgeIds" | "errorNodeIds" | "successNodeIds"
>;
