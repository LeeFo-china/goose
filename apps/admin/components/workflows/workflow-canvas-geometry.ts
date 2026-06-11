import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import {
  getWorkflowBranchNodeId,
  isWorkflowBranchEdgeForNode,
  withWorkflowBranchNodePosition,
  WORKFLOW_BRANCH_NODE_HEIGHT,
  WORKFLOW_BRANCH_NODE_WIDTH,
} from "@/components/workflows/workflow-branch-projection";

type PositionedWorkflowNode = Pick<WorkflowNode, "position"> & {
  canvasWidth?: number;
  canvasHeight?: number;
};

export const CANVAS_WIDTH = 1800;
export const CANVAS_HEIGHT = 1200;
export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 84;
export const HANDLE_HIT_SIZE = 44;
export const MIN_ZOOM = 0.5;
export const ARRANGE_ZOOM = 0.6;
export const MIN_FIT_ZOOM = 0.02;
export const MAX_ZOOM = 1.8;
export const ZOOM_STEP = 0.1;
const LAYOUT_SAFE_MARGIN = 24;
const LAYOUT_TOOLBAR_HEIGHT = 56;
const LAYOUT_COLUMN_GAP = 96;
const LAYOUT_ROW_GAP = 72;
const LAYOUT_ENTITY_GAP = 28;
const elk = new ELK();

export type CanvasPoint = { x: number; y: number };
export type CanvasSize = { width: number; height: number };
export type ArrangedWorkflowCanvas = {
  nodes: WorkflowNode[];
  zoom: number;
};

export function getExpandedCanvasSize(
  viewportSize: CanvasSize,
  zoom: number,
): CanvasSize {
  return {
    width: Math.max(CANVAS_WIDTH, viewportSize.width / zoom),
    height: Math.max(CANVAS_HEIGHT, viewportSize.height / zoom),
  };
}

export function getFitCanvasSize(viewportSize: CanvasSize, zoom: number): CanvasSize {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  }
  return {
    width: viewportSize.width / zoom,
    height: viewportSize.height / zoom,
  };
}

export function clampPosition(
  position: CanvasPoint,
  canvasSize: CanvasSize,
  minPosition: CanvasPoint = { x: 0, y: 0 },
  nodeSize: CanvasSize = { width: NODE_WIDTH, height: NODE_HEIGHT },
): CanvasPoint {
  return {
    x: Math.max(minPosition.x, Math.min(canvasSize.width - nodeSize.width, position.x)),
    y: Math.max(minPosition.y, Math.min(canvasSize.height - nodeSize.height, position.y)),
  };
}

export function getInputPoint(node: PositionedWorkflowNode): CanvasPoint {
  return { x: node.position.x, y: node.position.y + (node.canvasHeight ?? NODE_HEIGHT) / 2 };
}

export function getOutputPoint(node: PositionedWorkflowNode): CanvasPoint {
  return {
    x: node.position.x + (node.canvasWidth ?? NODE_WIDTH),
    y: node.position.y + (node.canvasHeight ?? NODE_HEIGHT) / 2,
  };
}

export function createConnectionPath(source: CanvasPoint, target: CanvasPoint) {
  const controlOffset = Math.max(90, Math.abs(target.x - source.x) / 2);
  const sourceControlX = source.x + controlOffset;
  const targetControlX = target.x - controlOffset;

  return [
    `M ${source.x} ${source.y}`,
    `C ${sourceControlX} ${source.y}`,
    `${targetControlX} ${target.y}`,
    `${target.x} ${target.y}`,
  ].join(" ");
}

export function getCanvasPoint(
  event: { clientX: number; clientY: number },
  canvasElement: HTMLDivElement | null,
  zoom: number,
) {
  if (!canvasElement) return { x: 0, y: 0 };
  const rect = canvasElement.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / zoom,
    y: (event.clientY - rect.top) / zoom,
  };
}

export function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export async function arrangeWorkflowCanvasNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  viewportSize: CanvasSize,
): Promise<ArrangedWorkflowCanvas> {
  if (nodes.length === 0) return { nodes, zoom: 1 };
  const branchSourceNodes = nodes.filter((node) => hasWorkflowBranchEdges(node, edges));
  const branchSourceIds = new Set(branchSourceNodes.map((node) => node.id));
  const graph: ElkNode = {
    id: "workflow",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": String(LAYOUT_ROW_GAP),
      "elk.spacing.edgeNode": String(LAYOUT_ENTITY_GAP),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYOUT_COLUMN_GAP),
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: [
      ...nodes.map((node) => ({
        id: node.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
      ...branchSourceNodes.map((node) => ({
        id: getWorkflowBranchNodeId(node.id),
        width: WORKFLOW_BRANCH_NODE_WIDTH,
        height: WORKFLOW_BRANCH_NODE_HEIGHT,
      })),
    ],
    edges: [
      ...branchSourceNodes.map((node) => ({
        id: `arrange-branch-link:${node.id}`,
        sources: [node.id],
        targets: [getWorkflowBranchNodeId(node.id)],
      })),
      ...edges.map((edge) => {
        const sourceNode = nodes.find((node) => node.id === edge.source_node_id);
        const source = sourceNode &&
            branchSourceIds.has(sourceNode.id) &&
            isWorkflowBranchEdgeForNode(sourceNode, edge)
          ? getWorkflowBranchNodeId(sourceNode.id)
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
  const layout = getElkLayoutFrame(layouted, viewportSize, ARRANGE_ZOOM);
  const positionById = new Map<string, CanvasPoint>();
  const branchPositionBySourceId = new Map<string, CanvasPoint>();
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
    zoom: ARRANGE_ZOOM,
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
  viewportSize: CanvasSize,
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
