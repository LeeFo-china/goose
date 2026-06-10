import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";

export const CANVAS_WIDTH = 1800;
export const CANVAS_HEIGHT = 1200;
export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 84;
export const HANDLE_HIT_SIZE = 44;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.8;
export const ZOOM_STEP = 0.1;
const LAYOUT_START_X = 120;
const LAYOUT_START_Y = 180;
const LAYOUT_COLUMN_GAP = 130;
const LAYOUT_ROW_GAP = 90;

export type CanvasPoint = { x: number; y: number };
export type CanvasSize = { width: number; height: number };

export function getExpandedCanvasSize(
  viewportSize: CanvasSize,
  zoom: number,
): CanvasSize {
  return {
    width: Math.max(CANVAS_WIDTH, viewportSize.width / zoom),
    height: Math.max(CANVAS_HEIGHT, viewportSize.height / zoom),
  };
}

export function clampPosition(
  position: CanvasPoint,
  canvasSize: CanvasSize,
): CanvasPoint {
  return {
    x: Math.max(0, Math.min(canvasSize.width - NODE_WIDTH, position.x)),
    y: Math.max(0, Math.min(canvasSize.height - NODE_HEIGHT, position.y)),
  };
}

export function getInputPoint(node: WorkflowNode): CanvasPoint {
  return { x: node.position.x, y: node.position.y + NODE_HEIGHT / 2 };
}

export function getOutputPoint(node: WorkflowNode): CanvasPoint {
  return { x: node.position.x + NODE_WIDTH, y: node.position.y + NODE_HEIGHT / 2 };
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
): WorkflowNode[] {
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

  const columns = new Map<number, WorkflowNode[]>();
  orderedNodes.forEach((node) => {
    const depth = depthById.get(node.id) || 0;
    columns.set(depth, [...(columns.get(depth) || []), node]);
  });

  const positionById = new Map<string, CanvasPoint>();
  [...columns.entries()]
    .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth)
    .forEach(([depth, columnNodes]) => {
      columnNodes.sort(compareWorkflowNodes).forEach((node, index) => {
        positionById.set(node.id, {
          x: LAYOUT_START_X + depth * (NODE_WIDTH + LAYOUT_COLUMN_GAP),
          y: LAYOUT_START_Y + index * (NODE_HEIGHT + LAYOUT_ROW_GAP),
        });
      });
    });

  return nodes.map((node) => ({
    ...node,
    position: positionById.get(node.id) || node.position,
  }));
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
