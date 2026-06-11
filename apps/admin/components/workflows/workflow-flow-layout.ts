import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import {
  getWorkflowBranchNodeId,
  getWorkflowBranchOutcomeByEdge,
  isWorkflowBranchEdgeForNode,
  withWorkflowBranchNodePosition,
  WORKFLOW_BRANCH_NODE_HEIGHT,
  WORKFLOW_BRANCH_NODE_WIDTH,
} from "@/components/workflows/workflow-branch-projection";
import { WORKFLOW_FLOW_BRANCH_TARGET_HANDLE } from "@/components/workflows/workflow-flow-adapter";
import {
  WORKFLOW_FLOW_ARRANGE_ZOOM,
  WORKFLOW_FLOW_NODE_HEIGHT,
  WORKFLOW_FLOW_NODE_WIDTH,
} from "@/components/workflows/workflow-flow-types";
import type { WorkflowEdge, WorkflowNode, WorkflowNodePosition } from "@/components/workflows/workflow-types";

export type WorkflowFlowViewportSize = { width: number; height: number };

export type ArrangedWorkflowFlow = {
  nodes: WorkflowNode[];
  zoom: number;
};

const LAYOUT_SAFE_MARGIN = 24;
const LAYOUT_TOOLBAR_HEIGHT = 56;
const LAYOUT_COLUMN_GAP = 120;
const LAYOUT_ROW_GAP = 88;
const LAYOUT_ENTITY_GAP = 28;
const elk = new ELK();

export async function arrangeWorkflowFlowNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  viewportSize: WorkflowFlowViewportSize,
): Promise<ArrangedWorkflowFlow> {
  if (nodes.length === 0) return { nodes, zoom: 1 };
  const branchSourceNodes = nodes.filter((node) => hasWorkflowBranchEdges(node, edges));
  const branchSourceIds = new Set(branchSourceNodes.map((node) => node.id));
  const graph: ElkNode = {
    id: "workflow",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": String(LAYOUT_ROW_GAP),
      "elk.spacing.edgeNode": String(LAYOUT_ENTITY_GAP),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYOUT_COLUMN_GAP),
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: [
      ...nodes.map((node) => ({
        id: node.id,
        width: WORKFLOW_FLOW_NODE_WIDTH,
        height: WORKFLOW_FLOW_NODE_HEIGHT,
      })),
      ...branchSourceNodes.map((node) => ({
        id: getWorkflowBranchNodeId(node.id),
        width: WORKFLOW_BRANCH_NODE_WIDTH,
        height: WORKFLOW_BRANCH_NODE_HEIGHT,
        layoutOptions: {
          "elk.portConstraints": "FIXED_POS",
        },
        ports: getWorkflowBranchLayoutPorts(getWorkflowBranchNodeId(node.id)),
      })),
    ],
    edges: [
      ...branchSourceNodes.map((node) => ({
        id: `arrange-branch-link:${node.id}`,
        sources: [node.id],
        targets: [getWorkflowBranchLayoutPortId(
          getWorkflowBranchNodeId(node.id),
          WORKFLOW_FLOW_BRANCH_TARGET_HANDLE,
        )],
      })),
      ...edges.map((edge) => {
        const sourceNode = nodes.find((node) => node.id === edge.source_node_id);
        const branchOutcome = sourceNode &&
            branchSourceIds.has(sourceNode.id) &&
            isWorkflowBranchEdgeForNode(sourceNode, edge)
          ? getWorkflowBranchOutcomeByEdge(edge)
          : null;
        const source = sourceNode && branchOutcome
          ? getWorkflowBranchLayoutPortId(getWorkflowBranchNodeId(sourceNode.id), branchOutcome)
          : edge.source_node_id;
        return {
          id: edge.id,
          sources: [source],
          targets: [edge.target_node_id],
        };
      }),
    ] satisfies ElkExtendedEdge[],
  };
  const layouted = await elk.layout(graph);
  const layout = getElkLayoutFrame(layouted, viewportSize, WORKFLOW_FLOW_ARRANGE_ZOOM);
  const positionById = new Map<string, WorkflowNodePosition>();
  const branchPositionBySourceId = new Map<string, WorkflowNodePosition>();
  (layouted.children || []).forEach((child) => {
    const point = {
      x: layout.offsetX + (child.x || 0),
      y: layout.offsetY + (child.y || 0),
    };
    if (child.id.startsWith("branch:")) {
      branchPositionBySourceId.set(child.id.slice("branch:".length), point);
      return;
    }
    positionById.set(child.id, point);
  });

  return {
    zoom: WORKFLOW_FLOW_ARRANGE_ZOOM,
    nodes: nodes.map((node) => {
      const nextNode = {
        ...node,
        position: positionById.get(node.id) || node.position,
      };
      const branchPosition = branchPositionBySourceId.get(node.id);
      return branchPosition
        ? withWorkflowBranchNodePosition(nextNode, branchPosition)
        : nextNode;
    }),
  };
}

function getElkLayoutFrame(
  graph: ElkNode,
  viewportSize: WorkflowFlowViewportSize,
  arrangeZoom: number,
) {
  const visualWidth = (graph.width || 0) * arrangeZoom;
  const visualHeight = (graph.height || 0) * arrangeZoom;
  const availableHeight = Math.max(240, viewportSize.height - LAYOUT_TOOLBAR_HEIGHT);
  return {
    offsetX: Math.max(LAYOUT_SAFE_MARGIN, (viewportSize.width - visualWidth) / 2) /
      arrangeZoom,
    offsetY: (LAYOUT_TOOLBAR_HEIGHT + Math.max(
      LAYOUT_SAFE_MARGIN,
      (availableHeight - visualHeight) / 2,
    )) / arrangeZoom,
  };
}

function hasWorkflowBranchEdges(node: WorkflowNode, edges: WorkflowEdge[]) {
  return edges.some((edge) => isWorkflowBranchEdgeForNode(node, edge));
}

function getWorkflowBranchLayoutPorts(branchNodeId: string) {
  return [
    {
      id: getWorkflowBranchLayoutPortId(branchNodeId, WORKFLOW_FLOW_BRANCH_TARGET_HANDLE),
      x: 0,
      y: WORKFLOW_BRANCH_NODE_HEIGHT / 2,
      width: 1,
      height: 1,
    },
    {
      id: getWorkflowBranchLayoutPortId(branchNodeId, "payment_success"),
      x: WORKFLOW_BRANCH_NODE_WIDTH,
      y: WORKFLOW_BRANCH_NODE_HEIGHT / 2,
      width: 1,
      height: 1,
    },
    {
      id: getWorkflowBranchLayoutPortId(branchNodeId, "approval_approved"),
      x: WORKFLOW_BRANCH_NODE_WIDTH,
      y: WORKFLOW_BRANCH_NODE_HEIGHT / 2,
      width: 1,
      height: 1,
    },
    {
      id: getWorkflowBranchLayoutPortId(branchNodeId, "payment_failed"),
      x: WORKFLOW_BRANCH_NODE_WIDTH / 2,
      y: WORKFLOW_BRANCH_NODE_HEIGHT,
      width: 1,
      height: 1,
    },
    {
      id: getWorkflowBranchLayoutPortId(branchNodeId, "approval_rejected"),
      x: WORKFLOW_BRANCH_NODE_WIDTH / 2,
      y: WORKFLOW_BRANCH_NODE_HEIGHT,
      width: 1,
      height: 1,
    },
  ];
}

function getWorkflowBranchLayoutPortId(branchNodeId: string, handleId: string) {
  return `${branchNodeId}:${handleId}`;
}
