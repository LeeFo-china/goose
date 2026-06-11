import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";

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

export function arrangeWorkflowCanvasNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  viewportSize: CanvasSize,
): ArrangedWorkflowCanvas {
  if (nodes.length === 0) return { nodes, zoom: 1 };
  const orderedNodes = getWorkflowCanvasOrderedNodes(nodes, edges);
  const layout = getBestFitLayout(orderedNodes.length, viewportSize, ARRANGE_ZOOM);
  const positionById = new Map<string, CanvasPoint>();
  orderedNodes.forEach((node, index) => {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    positionById.set(node.id, {
      x: layout.offsetX + column * (NODE_WIDTH + LAYOUT_COLUMN_GAP),
      y: layout.offsetY + row * (NODE_HEIGHT + LAYOUT_ROW_GAP),
    });
  });

  return {
    zoom: ARRANGE_ZOOM,
    nodes: nodes.map((node) => ({
      ...node,
      position: positionById.get(node.id) || node.position,
    })),
  };
}

function getWorkflowCanvasOrderedNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!nodeById.has(edge.source_node_id) || !nodeById.has(edge.target_node_id)) {
      return;
    }
    incomingCount.set(
      edge.target_node_id,
      (incomingCount.get(edge.target_node_id) || 0) + 1,
    );
    outgoing.set(edge.source_node_id, [
      ...(outgoing.get(edge.source_node_id) || []),
      edge.target_node_id,
    ]);
  });

  const orderedNodes = [...nodes].sort(compareWorkflowNodes);
  const depthById = new Map(orderedNodes.map((node) => [node.id, 0]));
  const queue = orderedNodes.filter((node) => incomingCount.get(node.id) === 0);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    visited.add(node.id);
    const sourceDepth = depthById.get(node.id) || 0;
    (outgoing.get(node.id) || []).forEach((targetNodeId) => {
      depthById.set(
        targetNodeId,
        Math.max(depthById.get(targetNodeId) || 0, sourceDepth + 1),
      );
      const nextIncomingCount = (incomingCount.get(targetNodeId) || 0) - 1;
      incomingCount.set(targetNodeId, nextIncomingCount);
      if (nextIncomingCount === 0) {
        const targetNode = nodeById.get(targetNodeId);
        if (targetNode) queue.push(targetNode);
        queue.sort(compareWorkflowNodes);
      }
    });
  }

  const fallbackDepth = Math.max(...depthById.values()) + 1;
  orderedNodes.forEach((node) => {
    if (!visited.has(node.id)) depthById.set(node.id, fallbackDepth);
  });

  return orderedNodes.sort((left, right) => {
    const depthOrder = (depthById.get(left.id) || 0) - (depthById.get(right.id) || 0);
    return depthOrder || compareWorkflowNodes(left, right);
  });
}

function getBestFitLayout(
  nodeCount: number,
  viewportSize: CanvasSize,
  arrangeZoom: number,
) {
  const availableWidth = Math.max(320, viewportSize.width - LAYOUT_SAFE_MARGIN * 2);
  const availableHeight = Math.max(
    240,
    viewportSize.height - LAYOUT_TOOLBAR_HEIGHT - LAYOUT_SAFE_MARGIN * 2,
  );
  const candidates = Array.from({ length: nodeCount }, (_, index) => {
    const columns = index + 1;
    const rows = Math.ceil(nodeCount / columns);
    const width = columns * NODE_WIDTH + (columns - 1) * LAYOUT_COLUMN_GAP;
    const height = rows * NODE_HEIGHT + (rows - 1) * LAYOUT_ROW_GAP;
    const zoom = Math.max(
      MIN_FIT_ZOOM,
      Math.min(1, availableWidth / width, availableHeight / height),
    );
    return { columns, rows, width, height, zoom };
  });
  const best = candidates.sort((left, right) => {
    if (right.zoom !== left.zoom) return right.zoom - left.zoom;
    return Math.abs(left.columns - left.rows) - Math.abs(right.columns - right.rows);
  })[0];
  const visualWidth = best.width * arrangeZoom;
  const visualHeight = best.height * arrangeZoom;

  return {
    columns: best.columns,
    offsetX: Math.max(LAYOUT_SAFE_MARGIN, (viewportSize.width - visualWidth) / 2) /
      arrangeZoom,
    offsetY: (LAYOUT_TOOLBAR_HEIGHT + Math.max(
      LAYOUT_SAFE_MARGIN,
      (availableHeight - visualHeight) / 2,
    )) / arrangeZoom,
  };
}

function compareWorkflowNodes(left: WorkflowNode, right: WorkflowNode) {
  const typeOrder = getWorkflowNodeTypeOrder(left) - getWorkflowNodeTypeOrder(right);
  if (typeOrder !== 0) return typeOrder;
  const sortOrder = left.sort_order - right.sort_order;
  if (sortOrder !== 0) return sortOrder;
  return left.node_key.localeCompare(right.node_key);
}

function getWorkflowNodeTypeOrder(node: WorkflowNode) {
  if (node.node_type === "start") return 0;
  if (node.node_type === "end") return 2;
  return 1;
}
