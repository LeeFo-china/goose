import type { Edge, Node } from "@xyflow/react";
import type {
  WorkflowBranchOutcomeKey,
} from "@/components/workflows/workflow-branch-projection";
import type { WorkflowValidationPlaybackSnapshot } from "@/components/workflows/workflow-validation-playback";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";

export const WORKFLOW_FLOW_NODE_WIDTH = 210;
export const WORKFLOW_FLOW_NODE_HEIGHT = 84;
export const WORKFLOW_FLOW_DECISION_NODE_WIDTH = 132;
export const WORKFLOW_FLOW_DECISION_NODE_HEIGHT = 132;
export const WORKFLOW_FLOW_ARRANGE_ZOOM = 0.6;
export const WORKFLOW_FLOW_MIN_ZOOM = 0.2;
export const WORKFLOW_FLOW_MAX_ZOOM = 1.8;

export type WorkflowFlowValidationState = "idle" | "active" | "success" | "error";

export type WorkflowFlowNodeData = {
  node: WorkflowNode;
  connecting: boolean;
  disabled?: boolean;
  editingTitle: boolean;
  onCancelRename: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
  onStartRename: (nodeId: string) => void;
  selected: boolean;
  validationState: WorkflowFlowValidationState;
};

export type WorkflowFlowEdgeData = {
  edge: WorkflowEdge;
  active: boolean;
  actionSourceKey: string;
  actionTargetKey: string;
  disabled?: boolean;
  onDeleteEdge: (edgeId: string) => void;
  pathSourceKey: string;
  pathTargetKey: string;
};

export type WorkflowFlowNode = Node<WorkflowFlowNodeData, "workflowNode">;

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
  editingTitleNodeId: string | null;
  nodes: WorkflowNode[];
  onDeleteEdge: (edgeId: string) => void;
  onCancelRename: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
  onStartRename: (nodeId: string) => void;
  selectedNodeId: string | null;
  connectingNodeId: string | null;
  successValidationNodeIds: Set<string>;
  activeValidationNodeIds: Set<string>;
};

export type WorkflowFlowPlaybackInput = Pick<
  WorkflowValidationPlaybackSnapshot,
  "activeNodeIds" | "activeEdgeIds" | "errorNodeIds" | "successNodeIds"
>;
