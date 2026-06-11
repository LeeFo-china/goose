"use client";

import type { PointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Layers3 } from "lucide-react";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_HEIGHT,
  NODE_WIDTH,
  ZOOM_STEP,
  clampPosition,
  clampZoom,
  getCanvasPoint,
  getExpandedCanvasSize,
  getOutputPoint,
  arrangeWorkflowCanvasNodes,
  type CanvasPoint,
  type CanvasSize,
} from "@/components/workflows/workflow-canvas-geometry";
import {
  WorkflowCanvasEdges,
  type WorkflowCanvasConnectionDraft,
} from "@/components/workflows/workflow-canvas-edges";
import {
  readStoredCanvasZoom,
  writeStoredCanvasZoom,
} from "@/components/workflows/workflow-canvas-view-state";
import { WorkflowCanvasToolbar } from "@/components/workflows/workflow-canvas-toolbar";
import { WorkflowCanvasBranchNode } from "@/components/workflows/workflow-canvas-branch-node";
import { WorkflowCanvasNode } from "@/components/workflows/workflow-canvas-node";
import { WORKFLOW_NODE_PRESET_DRAG_TYPE } from "@/components/workflows/workflow-node-library";
import { createWorkflowCanvasPan, type WorkflowCanvasPanState } from "@/components/workflows/workflow-canvas-pan";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import {
  buildWorkflowCanvasBranchNodes,
  buildWorkflowCanvasDisplayEdges,
  type WorkflowConnectionSource,
} from "@/components/workflows/workflow-branch-projection";
import type { WorkflowValidationPlaybackSnapshot } from "@/components/workflows/workflow-validation-playback";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";

type DragState = { nodeId: string; originX: number; originY: number; pointerX: number; pointerY: number; zoom: number };
const useCanvasLayoutEffect = typeof window === "undefined"
  ? useEffect
  : useLayoutEffect;

export function WorkflowCanvas({
  connectingNodeId,
  disabled,
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  onBeginConnect,
  onCancelConnect,
  onDeleteEdge,
  onDropNodePreset,
  onFinishConnect,
  onArrangeNodes,
  onMoveNode,
  onOpenNodeLibrary,
  onSelectNode,
  onSelectEdge,
  validationPlayback,
  viewStorageKey,
}: {
  connectingNodeId: string | null;
  disabled?: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onBeginConnect: (source: WorkflowConnectionSource) => void;
  onCancelConnect: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onDropNodePreset: (presetKey: string, position: WorkflowNode["position"]) => void;
  onFinishConnect: (nodeId: string) => void;
  onArrangeNodes: (nodes: WorkflowNode[]) => void;
  onMoveNode: (nodeId: string, position: WorkflowNode["position"]) => void;
  onOpenNodeLibrary: () => void;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  validationPlayback?: WorkflowValidationPlaybackSnapshot;
  viewStorageKey?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<WorkflowCanvasPanState | null>(null);
  const connectionDraftRef = useRef<WorkflowCanvasConnectionDraft | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<WorkflowCanvasConnectionDraft | null>(null);
  const [zoom, setZoom] = useState(1);
  const [canvasViewReady, setCanvasViewReady] = useState(!viewStorageKey);
  const [fitMode, setFitMode] = useState(false);
  const [fitPan, setFitPan] = useState<CanvasPoint>({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const canvasSize = getExpandedCanvasSize(viewportSize, zoom);
  const hasPanOffset = fitPan.x !== 0 || fitPan.y !== 0;
  const canvasTransform = `translate(${fitPan.x}px, ${fitPan.y}px) scale(${zoom})`;
  const minNodePosition = hasPanOffset ? { x: Math.min(0, -fitPan.x / zoom), y: Math.min(0, -fitPan.y / zoom) } : undefined;
  const branchNodes = buildWorkflowCanvasBranchNodes(nodes, edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const canvasNodeById = new Map<string, Pick<WorkflowNode, "id" | "node_key" | "position"> & {
    canvasWidth?: number;
    canvasHeight?: number;
  }>([
    ...nodes.map((node) => [node.id, node] as const),
    ...branchNodes.map((node) => [node.id, node] as const),
  ]);
  const displayEdges = buildWorkflowCanvasDisplayEdges({
    edges,
    branchNodes,
    nodeById,
  });
  const activeValidationNodeIds = new Set(validationPlayback?.activeNodeIds || []);
  const activeValidationEdgeIds = new Set(validationPlayback?.activeEdgeIds || []);
  const errorValidationNodeIds = new Set(validationPlayback?.errorNodeIds || []);
  const successValidationNodeIds = new Set(validationPlayback?.successNodeIds || []);
  const canvasPan = createWorkflowCanvasPan(panRef, scrollRef, disabled);

  useCanvasLayoutEffect(() => {
    if (!viewStorageKey) {
      setCanvasViewReady(true);
      return;
    }
    setCanvasViewReady(false);
    const storedZoom = readStoredCanvasZoom(viewStorageKey);
    setZoom(storedZoom ?? 1);
    setCanvasViewReady(true);
  }, [viewStorageKey]);

  useEffect(() => {
    if (!viewStorageKey || !canvasViewReady) return;
    writeStoredCanvasZoom(viewStorageKey, zoom);
  }, [canvasViewReady, viewStorageKey, zoom]);

  function updateConnectionDraft(draft: WorkflowCanvasConnectionDraft | null) {
    connectionDraftRef.current = draft;
    setConnectionDraft(draft);
  }

  function startConnection(input: {
    event: PointerEvent;
    from: CanvasPoint;
    source: WorkflowConnectionSource;
  }) {
    if (disabled) return;
    input.event.preventDefault();
    input.event.stopPropagation();
    updateConnectionDraft({
      sourceNodeId: input.source.nodeId,
      from: input.from,
      to: getCanvasPoint(input.event, canvasRef.current, zoom),
    });
    onSelectNode(input.source.nodeId);
    onBeginConnect(input.source);
  }

  function handleConnectionStart(event: PointerEvent, node: WorkflowNode) {
    startConnection({
      event,
      from: getOutputPoint(node),
      source: { nodeId: node.id },
    });
  }

  function handleBranchConnectionStart(
    event: PointerEvent,
    source: WorkflowConnectionSource,
    outcomeIndex: number,
  ) {
    const branchNode = branchNodes.find((node) => node.sourceNodeId === source.nodeId);
    if (!branchNode) return;
    startConnection({
      event,
      from: {
        x: branchNode.position.x + branchNode.canvasWidth,
        y: branchNode.position.y + (outcomeIndex === 0 ? 22 : branchNode.canvasHeight - 22),
      },
      source,
    });
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
        <div
          ref={canvasRef}
          data-workflow-canvas="true"
          data-workflow-canvas-view-ready={canvasViewReady ? "true" : "false"}
          data-workflow-validation-playback={validationPlayback?.status || "idle"}
          className={[
            "absolute inset-0 origin-top-left",
            canvasViewReady ? "opacity-100" : "opacity-0",
          ].join(" ")}
          style={{ transform: canvasTransform }}
        >
        <WorkflowCanvasEdges
          activeValidationEdgeIds={activeValidationEdgeIds}
          canvasSize={canvasSize}
          connectionDraft={connectionDraft}
          disabled={disabled}
          edges={displayEdges}
          hoveredEdgeId={hoveredEdgeId}
          nodeById={canvasNodeById}
          selectedEdgeId={selectedEdgeId}
          onDeleteEdge={onDeleteEdge}
          onHoverEdge={setHoveredEdgeId}
          onSelectEdge={onSelectEdge}
        />
        {nodes.map((node) => {
          const selected = node.id === selectedNodeId;
          const connecting = node.id === connectingNodeId;
          const validationState = activeValidationNodeIds.has(node.id)
            ? "active"
            : errorValidationNodeIds.has(node.id)
              ? "error"
              : successValidationNodeIds.has(node.id)
                ? "success"
                : "idle";
          return (
            <WorkflowCanvasNode
              key={node.id}
              connecting={connecting}
              connectingNodeId={connectingNodeId}
              disabled={disabled}
              node={node}
              selected={selected}
              validationState={validationState}
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
        {branchNodes.map((branchNode) => (
          <WorkflowCanvasBranchNode
            key={branchNode.id}
            branchNode={branchNode}
            connecting={branchNode.sourceNodeId === connectingNodeId}
            disabled={disabled}
            onConnectionStart={handleBranchConnectionStart}
          />
        ))}
        </div>
        </div>
      </div>
    </div>
  );
}
