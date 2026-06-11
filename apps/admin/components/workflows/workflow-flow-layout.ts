import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import {
  getWorkflowBranchOutcomeByEdge,
  getWorkflowBranchSourceKind,
} from "@/components/workflows/workflow-branch-projection";
import {
  WORKFLOW_FLOW_ARRANGE_ZOOM,
  WORKFLOW_FLOW_DECISION_NODE_HEIGHT,
  WORKFLOW_FLOW_DECISION_NODE_WIDTH,
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
      ...nodes.map((node) => {
        const size = getWorkflowLayoutNodeSize(node);
        const branchKind = getWorkflowBranchSourceKind(node);
        return {
          id: node.id,
          width: size.width,
          height: size.height,
          ...(branchKind
            ? {
                layoutOptions: {
                  "elk.portConstraints": "FIXED_POS",
                },
                ports: getWorkflowDecisionLayoutPorts(node),
              }
            : {}),
        };
      }),
    ],
    edges: [
      ...edges.map((edge) => {
        const sourceNode = nodes.find((node) => node.id === edge.source_node_id);
        const branchOutcome = sourceNode ? getWorkflowBranchOutcomeByEdge(edge) : null;
        const source = sourceNode && branchOutcome && getWorkflowBranchSourceKind(sourceNode)
          ? getWorkflowDecisionLayoutPortId(sourceNode.id, branchOutcome)
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
  (layouted.children || []).forEach((child) => {
    const point = {
      x: layout.offsetX + (child.x || 0),
      y: layout.offsetY + (child.y || 0),
    };
    positionById.set(child.id, point);
  });

  return {
    zoom: WORKFLOW_FLOW_ARRANGE_ZOOM,
    nodes: nodes.map((node) => ({
      ...node,
      position: positionById.get(node.id) || node.position,
    })),
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

function getWorkflowLayoutNodeSize(node: WorkflowNode) {
  return getWorkflowBranchSourceKind(node)
    ? {
        width: WORKFLOW_FLOW_DECISION_NODE_WIDTH,
        height: WORKFLOW_FLOW_DECISION_NODE_HEIGHT,
      }
    : {
        width: WORKFLOW_FLOW_NODE_WIDTH,
        height: WORKFLOW_FLOW_NODE_HEIGHT,
      };
}

function getWorkflowDecisionLayoutPorts(node: WorkflowNode) {
  const size = getWorkflowLayoutNodeSize(node);
  return [
    {
      id: getWorkflowDecisionLayoutPortId(node.id, "input"),
      x: 0,
      y: size.height / 2,
      width: 1,
      height: 1,
    },
    {
      id: getWorkflowDecisionLayoutPortId(node.id, "payment_success"),
      x: size.width,
      y: size.height / 2,
      width: 1,
      height: 1,
    },
    {
      id: getWorkflowDecisionLayoutPortId(node.id, "approval_approved"),
      x: size.width,
      y: size.height / 2,
      width: 1,
      height: 1,
    },
    {
      id: getWorkflowDecisionLayoutPortId(node.id, "payment_failed"),
      x: size.width / 2,
      y: size.height,
      width: 1,
      height: 1,
    },
    {
      id: getWorkflowDecisionLayoutPortId(node.id, "approval_rejected"),
      x: size.width / 2,
      y: size.height,
      width: 1,
      height: 1,
    },
  ];
}

function getWorkflowDecisionLayoutPortId(nodeId: string, handleId: string) {
  return `${nodeId}:${handleId}`;
}
