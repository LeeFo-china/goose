"use client";

import type { DragEvent, PointerEvent } from "react";
import { useRef, useState } from "react";
import { WorkflowNodeTypeConfig } from "@gooes/domain";
import { Link2, MousePointer2, X } from "lucide-react";
import { WORKFLOW_NODE_PRESET_DRAG_TYPE } from "@/components/workflows/workflow-node-library";
import { getWorkflowNodePreset } from "@/components/workflows/workflow-node-presets";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 1200;
const NODE_WIDTH = 210;
const NODE_HEIGHT = 84;
const HANDLE_SIZE = 14;

type DragState = {
  nodeId: string;
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
};

type CanvasPoint = {
  x: number;
  y: number;
};

type ConnectionDraft = {
  sourceNodeId: string;
  from: CanvasPoint;
  to: CanvasPoint;
};

function clampPosition(position: CanvasPoint): CanvasPoint {
  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH - NODE_WIDTH, position.x)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT - NODE_HEIGHT, position.y)),
  };
}

function getInputPoint(node: WorkflowNode): CanvasPoint {
  return {
    x: node.position.x,
    y: node.position.y + NODE_HEIGHT / 2,
  };
}

function getOutputPoint(node: WorkflowNode): CanvasPoint {
  return {
    x: node.position.x + NODE_WIDTH,
    y: node.position.y + NODE_HEIGHT / 2,
  };
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
  event: Pick<PointerEvent | DragEvent, "clientX" | "clientY">,
  canvasElement: HTMLDivElement | null,
) {
  if (!canvasElement) return { x: 0, y: 0 };
  const rect = canvasElement.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
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
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  function handleConnectionStart(event: PointerEvent, node: WorkflowNode) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const from = getOutputPoint(node);
    setConnectionDraft({
      sourceNodeId: node.id,
      from,
      to: getCanvasPoint(event, canvasRef.current),
    });
    onSelectNode(node.id);
    onBeginConnect(node.id);
  }

  function finishConnectionFromPointer(event: PointerEvent) {
    if (!connectionDraft) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-node-input]");
    const targetNodeId = target?.dataset.nodeId || null;

    setConnectionDraft(null);
    if (targetNodeId && targetNodeId !== connectionDraft.sourceNodeId) {
      onFinishConnect(targetNodeId);
      return;
    }
    onCancelConnect();
  }

  return (
    <div
      data-workflow-canvas-scroll="true"
      className="relative min-h-0 overflow-auto bg-muted/30"
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
        const point = getCanvasPoint(event, canvasRef.current);
        onDropNodePreset(presetKey, clampPosition({
          x: point.x - NODE_WIDTH / 2,
          y: point.y - NODE_HEIGHT / 2,
        }));
      }}
      onPointerMove={(event) => {
        if (!connectionDraft) return;
        setConnectionDraft({
          ...connectionDraft,
          to: getCanvasPoint(event, canvasRef.current),
        });
      }}
      onPointerUp={finishConnectionFromPointer}
      onPointerCancel={() => {
        dragRef.current = null;
        setConnectionDraft(null);
        onCancelConnect();
      }}
    >
      <div
        ref={canvasRef}
        data-workflow-canvas="true"
        className="relative"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
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
            <Button
              key={`${edge.id}-delete`}
              type="button"
              size="icon"
              variant="outline"
              className="absolute z-10 size-7 bg-background"
              disabled={disabled}
              style={{ left, top, transform: "translate(-50%, -50%)" }}
              onClick={() => onDeleteEdge(edge.id)}
            >
              <X className="size-3.5" />
            </Button>
          );
        })}
        {nodes.map((node) => {
          const selected = node.id === selectedNodeId;
          const connecting = node.id === connectingNodeId;
          return (
            <div
              key={node.id}
              className={[
                "absolute flex flex-col justify-center rounded-md border bg-background px-4 text-left",
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
                  event.target.closest("[data-node-action]")
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
                };
                onSelectNode(node.id);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.nodeId !== node.id) return;
                onMoveNode(node.id, clampPosition({
                  x: drag.originX + event.clientX - drag.pointerX,
                  y: drag.originY + event.clientY - drag.pointerY,
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
                data-node-action="select"
                type="button"
                className="min-w-0 border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode(node.id);
                }}
              >
                <span className="block truncate text-sm font-medium">
                  {node.title}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className="shrink-0">
                    {WorkflowNodeTypeConfig[node.node_type]?.label || node.node_type}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {node.node_key}
                  </span>
                </span>
              </button>
              {node.node_type !== "start" ? (
                <button
                  data-node-action="input"
                  data-node-input="true"
                  data-node-id={node.id}
                  type="button"
                  aria-label={`${node.title} 输入端口`}
                  className={[
                    "absolute top-1/2 rounded-full border-2 bg-background",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    connectingNodeId && connectingNodeId !== node.id
                      ? "border-primary ring-4 ring-primary/15"
                      : "border-muted-foreground/50 hover:border-primary",
                  ].join(" ")}
                  disabled={disabled}
                  style={{
                    left: -HANDLE_SIZE / 2,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    transform: "translateY(-50%)",
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    if (connectionDraft && connectionDraft.sourceNodeId !== node.id) {
                      setConnectionDraft(null);
                      onFinishConnect(node.id);
                    }
                  }}
                />
              ) : null}
              {node.node_type !== "end" ? (
                <button
                  data-node-action="output"
                  type="button"
                  aria-label={`${node.title} 输出端口`}
                  className={[
                    "absolute top-1/2 rounded-full border-2 bg-background",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    connecting ? "border-primary ring-4 ring-primary/15" : "border-primary",
                    disabled ? "cursor-not-allowed" : "cursor-crosshair",
                  ].join(" ")}
                  disabled={disabled}
                  style={{
                    right: -HANDLE_SIZE / 2,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
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
  );
}
