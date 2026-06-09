"use client";

import { useRef } from "react";
import { WorkflowNodeTypeConfig } from "@gooes/domain";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DragState = {
  nodeId: string;
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
};

export function WorkflowCanvas({
  connectingNodeId,
  disabled,
  nodes,
  edges,
  selectedNodeId,
  onBeginConnect,
  onDeleteEdge,
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
  onDeleteEdge: (edgeId: string) => void;
  onFinishConnect: (nodeId: string) => void;
  onMoveNode: (nodeId: string, position: WorkflowNode["position"]) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const dragRef = useRef<DragState | null>(null);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  function handleConnect(nodeId: string) {
    if (disabled) return;
    if (connectingNodeId && connectingNodeId !== nodeId) {
      onFinishConnect(nodeId);
      return;
    }
    onBeginConnect(nodeId);
  }

  return (
    <div className="relative min-h-0 overflow-auto bg-muted/30">
      <svg className="absolute inset-0 h-[900px] w-[1300px]" aria-hidden="true">
        <defs>
          <marker
            id="workflow-arrow"
            markerHeight="10"
            markerUnits="strokeWidth"
            markerWidth="10"
            orient="auto"
            refX="8"
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
            <line
              key={edge.id}
              markerEnd="url(#workflow-arrow)"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="2"
              x1={source.position.x + 180}
              x2={target.position.x}
              y1={source.position.y + 36}
              y2={target.position.y + 36}
            />
          );
        })}
      </svg>
      <div className="relative h-[900px] w-[1300px]">
        {edges.map((edge) => {
          const source = nodeById.get(edge.source_node_id);
          const target = nodeById.get(edge.target_node_id);
          if (!source || !target) return null;
          const left = (source.position.x + 180 + target.position.x) / 2;
          const top = (source.position.y + 36 + target.position.y + 36) / 2;

          return (
            <Button
              key={`${edge.id}-delete`}
              type="button"
              size="sm"
              variant="outline"
              className="absolute h-7 bg-background px-2 text-xs"
              disabled={disabled}
              style={{ left, top }}
              onClick={() => onDeleteEdge(edge.id)}
            >
              删除连线
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
                "absolute flex h-[72px] w-[180px] flex-col items-start",
                "justify-center rounded-md border bg-background px-3 text-left",
                "shadow-sm transition",
                disabled ? "cursor-not-allowed opacity-70" : "cursor-move",
                connecting
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : selected
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-primary/60",
              ].join(" ")}
              style={{ left: node.position.x, top: node.position.y }}
              onPointerDown={(event) => {
                if (disabled) return;
                if (event.target instanceof HTMLElement && event.target.closest("[data-node-action]")) {
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
                onMoveNode(node.id, {
                  x: Math.max(0, drag.originX + event.clientX - drag.pointerX),
                  y: Math.max(0, drag.originY + event.clientY - drag.pointerY),
                });
              }}
              onPointerUp={() => {
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
                <span className="block max-w-[118px] truncate text-sm font-medium">
                  {node.title}
                </span>
                <Badge variant="outline" className="mt-1">
                  {WorkflowNodeTypeConfig[node.node_type]?.label || node.node_type}
                </Badge>
              </button>
              <Button
                data-node-action="connect"
                type="button"
                size="sm"
                variant={connecting ? "default" : "outline"}
                className="absolute right-2 top-2 h-6 px-2 text-xs"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  handleConnect(node.id);
                }}
              >
                {connectingNodeId && connectingNodeId !== node.id ? "目标" : "连线"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
