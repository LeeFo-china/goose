"use client";

import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link2, MousePointer2, X, ZoomIn, ZoomOut } from "lucide-react";
import { getWorkflowNodeDisplayLabels } from "@/components/workflows/workflow-node-capabilities";
import { WORKFLOW_NODE_PRESET_DRAG_TYPE } from "@/components/workflows/workflow-node-library";
import { createWorkflowCanvasPan, type WorkflowCanvasPanState } from "@/components/workflows/workflow-canvas-pan";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 1200;
const NODE_WIDTH = 210;
const NODE_HEIGHT = 84;
const HANDLE_HIT_SIZE = 44;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;

type DragState = { nodeId: string; originX: number; originY: number; pointerX: number; pointerY: number; zoom: number };
type CanvasPoint = { x: number; y: number };
type ConnectionDraft = { sourceNodeId: string; from: CanvasPoint; to: CanvasPoint };

function clampPosition(position: CanvasPoint): CanvasPoint {
  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH - NODE_WIDTH, position.x)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT - NODE_HEIGHT, position.y)),
  };
}

function getInputPoint(node: WorkflowNode): CanvasPoint {
  return { x: node.position.x, y: node.position.y + NODE_HEIGHT / 2 };
}

function getOutputPoint(node: WorkflowNode): CanvasPoint {
  return { x: node.position.x + NODE_WIDTH, y: node.position.y + NODE_HEIGHT / 2 };
}

function createConnectionPath(source: CanvasPoint, target: CanvasPoint) {
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

function getCanvasPoint(
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

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export function WorkflowCanvas({
  connectingNodeId,
  disabled,
  nodes,
  edges,
  selectedNodeId,
  onBeginConnect,
  onCancelConnect,
  onDeleteEdge,
  onDropNodePreset,
  onFinishConnect,
  onMoveNode,
  onSelectNode,
}: {
  connectingNodeId: string | null;
  disabled?: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  onBeginConnect: (nodeId: string) => void;
  onCancelConnect: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onDropNodePreset: (presetKey: string, position: WorkflowNode["position"]) => void;
  onFinishConnect: (nodeId: string) => void;
  onMoveNode: (nodeId: string, position: WorkflowNode["position"]) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<WorkflowCanvasPanState | null>(null);
  const connectionDraftRef = useRef<ConnectionDraft | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [zoom, setZoom] = useState(1);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const canvasPan = createWorkflowCanvasPan(panRef, scrollRef, disabled);

  function updateConnectionDraft(draft: ConnectionDraft | null) {
    connectionDraftRef.current = draft;
    setConnectionDraft(draft);
  }

  function handleConnectionStart(event: PointerEvent, node: WorkflowNode) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const from = getOutputPoint(node);
    updateConnectionDraft({
      sourceNodeId: node.id,
      from,
      to: getCanvasPoint(event, canvasRef.current, zoom),
    });
    onSelectNode(node.id);
    onBeginConnect(node.id);
  }

  function applyZoom(nextZoom: number, origin?: CanvasPoint) {
    const scrollElement = scrollRef.current;
    const clampedZoom = clampZoom(nextZoom);
    if (!scrollElement) {
      setZoom(clampedZoom);
      return;
    }

    const currentOrigin = origin || {
      x: (scrollElement.scrollLeft + scrollElement.clientWidth / 2) / zoom,
      y: (scrollElement.scrollTop + scrollElement.clientHeight / 2) / zoom,
    };
    const viewportX = origin
      ? currentOrigin.x * zoom - scrollElement.scrollLeft
      : scrollElement.clientWidth / 2;
    const viewportY = origin
      ? currentOrigin.y * zoom - scrollElement.scrollTop
      : scrollElement.clientHeight / 2;

    setZoom(clampedZoom);
    requestAnimationFrame(() => {
      scrollElement.scrollLeft = Math.max(0, currentOrigin.x * clampedZoom - viewportX);
      scrollElement.scrollTop = Math.max(0, currentOrigin.y * clampedZoom - viewportY);
    });
  }

  function finishConnectionFromPointer(event: PointerEvent) {
    const draft = connectionDraftRef.current;
    if (!draft) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-node-input]");
    const targetNodeId = target?.dataset.nodeId || null;

    updateConnectionDraft(null);
    if (targetNodeId && targetNodeId !== draft.sourceNodeId) {
      onFinishConnect(targetNodeId);
      return;
    }
    onCancelConnect();
  }

  function finishConnectionToNode(targetNodeId: string) {
    const sourceNodeId = connectionDraftRef.current?.sourceNodeId || connectingNodeId;
    if (!sourceNodeId || sourceNodeId === targetNodeId) return;
    updateConnectionDraft(null);
    onFinishConnect(targetNodeId);
  }

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    function handleWheel(event: WheelEvent) {
      if (disabled) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      applyZoom(zoom + delta, getCanvasPoint(event, canvasRef.current, zoom));
    }

    scrollElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => scrollElement.removeEventListener("wheel", handleWheel);
  }, [disabled, zoom]);

  return (
    <div
      ref={scrollRef}
      data-workflow-canvas-scroll="true"
      className="relative h-full min-h-0 cursor-grab overflow-auto bg-muted/30 active:cursor-grabbing"
      onPointerDown={canvasPan.begin}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (disabled) return;
        const presetKey = event.dataTransfer.getData(WORKFLOW_NODE_PRESET_DRAG_TYPE) ||
          event.dataTransfer.getData("text/plain");
        if (!presetKey || !getWorkflowNodePreset(presetKey)) return;
        event.preventDefault();
        const point = getCanvasPoint(event, canvasRef.current, zoom);
        onDropNodePreset(presetKey, clampPosition({
          x: point.x - NODE_WIDTH / 2,
          y: point.y - NODE_HEIGHT / 2,
        }));
      }}
      onPointerMove={(event) => {
        if (canvasPan.move(event)) return;
        const draft = connectionDraftRef.current;
        if (!draft) return;
        updateConnectionDraft({
          ...draft,
          to: getCanvasPoint(event, canvasRef.current, zoom),
        });
      }}
      onPointerUp={(event) => { if (!canvasPan.end(event)) finishConnectionFromPointer(event); }}
      onPointerCancel={() => {
        panRef.current = null; dragRef.current = null; updateConnectionDraft(null); onCancelConnect();
      }}
    >
      <div
        className="relative"
        style={{
          width: CANVAS_WIDTH * zoom,
          height: CANVAS_HEIGHT * zoom,
        }}
      >
        <div
          ref={canvasRef}
          data-workflow-canvas="true"
          className="relative origin-top-left"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: `scale(${zoom})`,
            backgroundImage: [
              "linear-gradient(hsl(var(--border) / 0.65) 1px, transparent 1px)",
              "linear-gradient(90deg, hsl(var(--border) / 0.65) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "32px 32px",
          }}
        >
          <div className="sticky left-3 top-3 z-20 flex w-fit items-center gap-2 rounded-md border bg-background/95 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <MousePointer2 className="size-3.5" />
            <span>{nodes.length} 节点</span>
            <span className="text-border">|</span>
            <Link2 className="size-3.5" />
            <span>{edges.length} 连线</span>
            <span className="text-border">|</span>
            <Button
              aria-label="缩小画布"
              type="button"
              size="icon"
              variant="ghost"
              className="size-11 text-muted-foreground"
              disabled={disabled || zoom <= MIN_ZOOM}
              onClick={() => applyZoom(zoom - ZOOM_STEP)}
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <span data-workflow-canvas-zoom="true" className="w-10 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              aria-label="放大画布"
              type="button"
              size="icon"
              variant="ghost"
              className="size-11 text-muted-foreground"
              disabled={disabled || zoom >= MAX_ZOOM}
              onClick={() => applyZoom(zoom + ZOOM_STEP)}
            >
              <ZoomIn className="size-3.5" />
            </Button>
          </div>
        <svg
          className="pointer-events-none absolute inset-0"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="workflow-arrow"
              markerHeight="10"
              markerUnits="strokeWidth"
              markerWidth="10"
              orient="auto"
              refX="9"
              refY="3"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="hsl(var(--muted-foreground))" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const source = nodeById.get(edge.source_node_id);
            const target = nodeById.get(edge.target_node_id);
            if (!source || !target) return null;

            return (
              <path
                key={edge.id}
                d={createConnectionPath(getOutputPoint(source), getInputPoint(target))}
                fill="none"
                markerEnd="url(#workflow-arrow)"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth="2"
              />
            );
          })}
          {connectionDraft ? (
            <path
              d={createConnectionPath(connectionDraft.from, connectionDraft.to)}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeDasharray="6 6"
              strokeWidth="2"
            />
          ) : null}
        </svg>
        {edges.map((edge) => {
          const source = nodeById.get(edge.source_node_id);
          const target = nodeById.get(edge.target_node_id);
          if (!source || !target) return null;
          const sourcePoint = getOutputPoint(source);
          const targetPoint = getInputPoint(target);
          const left = (sourcePoint.x + targetPoint.x) / 2;
          const top = (sourcePoint.y + targetPoint.y) / 2;

          return (
            <button
              data-edge-action="delete"
              aria-label="删除连线"
              key={`${edge.id}-delete`}
              type="button"
              className="absolute z-10 flex size-6 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              disabled={disabled}
              style={{ left, top, transform: "translate(-50%, -50%)" }}
              onClick={() => onDeleteEdge(edge.id)}
            >
              <X className="size-4" />
            </button>
          );
        })}
        {nodes.map((node) => {
          const selected = node.id === selectedNodeId;
          const connecting = node.id === connectingNodeId;
          const displayLabels = getWorkflowNodeDisplayLabels(node);
          return (
            <div
              data-workflow-node="true"
              key={node.id}
              className={[
                "absolute z-20 flex flex-col justify-center rounded-md border bg-background px-4 text-left",
                "shadow-sm transition",
                disabled ? "cursor-not-allowed opacity-70" : "cursor-move",
                connecting
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : selected
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/60",
              ].join(" ")}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              }}
              onPointerDown={(event) => {
                if (disabled) return;
                if (
                  event.target instanceof HTMLElement &&
                  event.target.closest("[data-node-port], [data-edge-action]")
                ) {
                  return;
                }
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  nodeId: node.id,
                  originX: node.position.x,
                  originY: node.position.y,
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  zoom,
                };
                onSelectNode(node.id);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.nodeId !== node.id) return;
                onMoveNode(node.id, clampPosition({
                  x: drag.originX + (event.clientX - drag.pointerX) / drag.zoom,
                  y: drag.originY + (event.clientY - drag.pointerY) / drag.zoom,
                }));
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              <button
                type="button"
                className="min-w-0 border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode(node.id);
                }}
              >
                <span className="block truncate text-sm font-medium">
                  {displayLabels.specificLabel}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5">
                  <Badge variant="outline" className="shrink-0 bg-background text-[11px]">
                    {displayLabels.capabilityLabel}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {node.node_key}
                  </span>
                </span>
              </button>
              {node.node_type !== "start" ? (
                <button
                  data-node-port="input"
                  data-node-input="true"
                  data-node-id={node.id}
                  type="button"
                  aria-label={`${displayLabels.specificLabel} 输入端口`}
                  className={[
                    "absolute top-1/2 rounded-full bg-transparent",
                    "after:absolute after:left-1/2 after:top-1/2 after:size-3.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:bg-background",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    connectingNodeId && connectingNodeId !== node.id
                      ? "after:border-primary ring-4 ring-primary/15"
                      : "after:border-muted-foreground/50 hover:after:border-primary",
                  ].join(" ")}
                  disabled={disabled}
                  style={{
                    left: -HANDLE_HIT_SIZE / 2,
                    width: HANDLE_HIT_SIZE,
                    height: HANDLE_HIT_SIZE,
                    transform: "translateY(-50%)",
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    finishConnectionToNode(node.id);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    finishConnectionToNode(node.id);
                  }}
                />
              ) : null}
              {node.node_type !== "end" ? (
                <button
                  data-node-action="output"
                  data-node-port="output"
                  type="button"
                  aria-label={`${displayLabels.specificLabel} 输出端口`}
                  className={[
                    "absolute top-1/2 rounded-full bg-transparent",
                    "after:absolute after:left-1/2 after:top-1/2 after:size-3.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:bg-background",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    connecting ? "after:border-primary ring-4 ring-primary/15" : "after:border-primary",
                    disabled ? "cursor-not-allowed" : "cursor-crosshair",
                  ].join(" ")}
                  disabled={disabled}
                  style={{
                    right: -HANDLE_HIT_SIZE / 2,
                    width: HANDLE_HIT_SIZE,
                    height: HANDLE_HIT_SIZE,
                    transform: "translateY(-50%)",
                  }}
                  onPointerDown={(event) => handleConnectionStart(event, node)}
                />
              ) : null}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
