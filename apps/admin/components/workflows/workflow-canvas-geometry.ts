import type { WorkflowNode } from "@/components/workflows/workflow-types";

export const CANVAS_WIDTH = 1800;
export const CANVAS_HEIGHT = 1200;
export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 84;
export const HANDLE_HIT_SIZE = 44;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.8;
export const ZOOM_STEP = 0.1;

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
