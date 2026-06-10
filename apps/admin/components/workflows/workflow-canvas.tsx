"use client";

import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  HANDLE_HIT_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_HEIGHT,
  NODE_WIDTH,
  ZOOM_STEP,
  clampPosition,
  clampZoom,
  createConnectionPath,
  getCanvasPoint,
  getExpandedCanvasSize,
  getInputPoint,
  getOutputPoint,
  arrangeWorkflowCanvasNodes,
  type CanvasPoint,
  type CanvasSize,
} from "@/components/workflows/workflow-canvas-geometry";
import { WorkflowCanvasToolbar } from "@/components/workflows/workflow-canvas-toolbar";
import { getWorkflowNodeDisplayLabels } from "@/components/workflows/workflow-node-capabilities";
import { WORKFLOW_NODE_PRESET_DRAG_TYPE } from "@/components/workflows/workflow-node-library";
import { createWorkflowCanvasPan, type WorkflowCanvasPanState } from "@/components/workflows/workflow-canvas-pan";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";

type DragState = { nodeId: string; originX: number; originY: number; pointerX: number; pointerY: number; zoom: number };
type ConnectionDraft = { sourceNodeId: string; from: CanvasPoint; to: CanvasPoint };

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
  onArrangeNodes,
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
  onArrangeNodes: (nodes: WorkflowNode[]) => void;
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
  const [fitMode, setFitMode] = useState(false);
  const [fitPan, setFitPan] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const canvasSize = getExpandedCanvasSize(viewportSize, zoom);
  const canvasTransform = fitMode ? `translate(${fitPan.x}px, ${fitPan.y}px) scale(${zoom})` : `scale(${zoom})`;
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
    if (fitMode) {
      const anchor = origin
        ? { x: origin.x * zoom + fitPan.x, y: origin.y * zoom + fitPan.y }
        : {
          x: scrollElement ? scrollElement.clientWidth / 2 : viewportSize.width / 2,
          y: scrollElement ? scrollElement.clientHeight / 2 : viewportSize.height / 2,
      };
      const scaleRatio = clampedZoom / zoom;
      setZoom(clampedZoom);
      setFitPan((current) => ({ x: anchor.x - (anchor.x - current.x) * scaleRatio, y: anchor.y - (anchor.y - current.y) * scaleRatio }));
      return;
    }
    if (!scrollElement) {
      setZoom(clampedZoom);
      setFitMode(false);
      setFitPan({ x: 0, y: 0 });
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
    setFitMode(false);
    setFitPan({ x: 0, y: 0 });
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

  function arrangeNodesToViewport() {
    const arranged = arrangeWorkflowCanvasNodes(nodes, edges, viewportSize);
    setZoom(arranged.zoom);
    setFitMode(true);
    setFitPan({ x: 0, y: 0 });
    updateConnectionDraft(null);
    onCancelConnect();
    onArrangeNodes(arranged.nodes);
    requestAnimationFrame(() => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) return;
      scrollElement.scrollLeft = 0;
      scrollElement.scrollTop = 0;
    });
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
  }, [disabled, fitMode, fitPan.x, fitPan.y, viewportSize.height, viewportSize.width, zoom]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const updateViewportSize = () => {
      const width = scrollElement.clientWidth;
      const height = scrollElement.clientHeight;
      setViewportSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height });
    };
    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={scrollRef}
      data-workflow-canvas-scroll="true"
      className={[
        "relative h-full min-h-0 cursor-grab bg-muted/30 active:cursor-grabbing",
        fitMode ? "overflow-hidden" : "overflow-auto",
      ].join(" ")}
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
        setFitMode(false);
        setFitPan({ x: 0, y: 0 });
        onDropNodePreset(presetKey, clampPosition({
          x: point.x - NODE_WIDTH / 2,
          y: point.y - NODE_HEIGHT / 2,
        }, canvasSize));
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
      <WorkflowCanvasToolbar
        disabled={disabled}
        edgeCount={edges.length}
        maxZoom={MAX_ZOOM}
        minZoom={MIN_ZOOM}
        nodeCount={nodes.length}
        zoom={zoom}
        onArrange={arrangeNodesToViewport}
        onZoomIn={() => applyZoom(zoom + ZOOM_STEP)}
        onZoomOut={() => applyZoom(zoom - ZOOM_STEP)}
      />
      <div
        className="relative"
        style={{
          width: canvasSize.width * zoom,
          height: canvasSize.height * zoom,
        }}
      >
        <div
          data-workflow-canvas="true"
          className="relative"
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
            backgroundImage: [
              "linear-gradient(hsl(var(--border) / 0.65) 1px, transparent 1px)",
              "linear-gradient(90deg, hsl(var(--border) / 0.65) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "32px 32px",
          }}
        >
        <div ref={canvasRef} data-workflow-canvas="true" className="absolute inset-0 origin-top-left" style={{ transform: canvasTransform }}>
        <svg
          className="pointer-events-none absolute inset-0"
          width={canvasSize.width}
          height={canvasSize.height}
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
                }, canvasSize));
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
    </div>
  );
}
