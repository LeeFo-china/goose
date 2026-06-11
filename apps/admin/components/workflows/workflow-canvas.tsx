"use client";

import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Layers3, X } from "lucide-react";
import {
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
import { WorkflowCanvasNode } from "@/components/workflows/workflow-canvas-node";
import { WORKFLOW_NODE_PRESET_DRAG_TYPE } from "@/components/workflows/workflow-node-library";
import { createWorkflowCanvasPan, type WorkflowCanvasPanState } from "@/components/workflows/workflow-canvas-pan";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";

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
  onOpenNodeLibrary,
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
  onOpenNodeLibrary: () => void;
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
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const canvasSize = getExpandedCanvasSize(viewportSize, zoom);
  const hasPanOffset = fitPan.x !== 0 || fitPan.y !== 0;
  const canvasTransform = `translate(${fitPan.x}px, ${fitPan.y}px) scale(${zoom})`;
  const minNodePosition = hasPanOffset ? { x: Math.min(0, -fitPan.x / zoom), y: Math.min(0, -fitPan.y / zoom) } : undefined;
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

    const viewportX = origin ? origin.x * zoom + fitPan.x - scrollElement.scrollLeft : scrollElement.clientWidth / 2;
    const viewportY = origin ? origin.y * zoom + fitPan.y - scrollElement.scrollTop : scrollElement.clientHeight / 2;
    const currentOrigin = origin || {
      x: (scrollElement.scrollLeft + viewportX - fitPan.x) / zoom,
      y: (scrollElement.scrollTop + viewportY - fitPan.y) / zoom,
    };
    const nextFitPan = { ...fitPan };
    let nextScrollLeft = currentOrigin.x * clampedZoom + nextFitPan.x - viewportX;
    let nextScrollTop = currentOrigin.y * clampedZoom + nextFitPan.y - viewportY;
    if (nextScrollLeft < 0) { nextFitPan.x -= nextScrollLeft; nextScrollLeft = 0; }
    if (nextScrollTop < 0) { nextFitPan.y -= nextScrollTop; nextScrollTop = 0; }
    const normalizedX = Math.min(Math.max(0, nextFitPan.x), Math.max(0, nextScrollLeft));
    const normalizedY = Math.min(Math.max(0, nextFitPan.y), Math.max(0, nextScrollTop));
    nextFitPan.x -= normalizedX; nextScrollLeft -= normalizedX;
    nextFitPan.y -= normalizedY; nextScrollTop -= normalizedY;

    setZoom(clampedZoom);
    setFitPan(nextFitPan);
    requestAnimationFrame(() => {
      scrollElement.scrollLeft = nextScrollLeft;
      scrollElement.scrollTop = nextScrollTop;
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
      <div className="pointer-events-none sticky left-0 right-0 top-3 z-30 h-0 px-3">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-events-auto h-9 bg-background/95 text-muted-foreground shadow-sm backdrop-blur"
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpenNodeLibrary();
            }}
          >
            <Layers3 data-icon="inline-start" />
            节点库
          </Button>
        </div>
      </div>
      <div
        className="relative"
        style={{
          width: canvasSize.width * zoom + Math.max(0, fitPan.x),
          height: canvasSize.height * zoom + Math.max(0, fitPan.y),
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
          className="pointer-events-none absolute inset-0 overflow-visible"
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
            const hovered = hoveredEdgeId === edge.id;

            return (
              <path
                key={edge.id}
                d={createConnectionPath(getOutputPoint(source), getInputPoint(target))}
                fill="none"
                markerEnd="url(#workflow-arrow)"
                strokeDasharray={hovered ? "1 7" : undefined}
                strokeLinecap={hovered ? "round" : undefined}
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
              className="absolute z-10 flex size-6 items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-sm transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              disabled={disabled}
              style={{ left, top, transform: "translate(-50%, -50%)" }}
              onBlur={() => setHoveredEdgeId(null)}
              onClick={() => {
                setHoveredEdgeId(null);
                onDeleteEdge(edge.id);
              }}
              onFocus={() => setHoveredEdgeId(edge.id)}
              onPointerEnter={() => setHoveredEdgeId(edge.id)}
              onPointerLeave={() => setHoveredEdgeId(null)}
            >
              <X className="size-4" />
            </button>
          );
        })}
        {nodes.map((node) => {
          const selected = node.id === selectedNodeId;
          const connecting = node.id === connectingNodeId;
          return (
            <WorkflowCanvasNode
              key={node.id}
              connecting={connecting}
              connectingNodeId={connectingNodeId}
              disabled={disabled}
              node={node}
              selected={selected}
              onConnectionStart={handleConnectionStart}
              onFinishConnect={finishConnectionToNode}
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
                }, canvasSize, minNodePosition));
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
              onSelect={onSelectNode}
            />
          );
        })}
        </div>
        </div>
      </div>
    </div>
  );
}
