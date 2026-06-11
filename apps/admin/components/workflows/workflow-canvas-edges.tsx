import { GitBranch, X } from "lucide-react";
import {
  createConnectionPath,
  getInputPoint,
  getOutputPoint,
  type CanvasSize,
  type CanvasPoint,
} from "@/components/workflows/workflow-canvas-geometry";
import type { WorkflowCanvasDisplayEdge } from "@/components/workflows/workflow-branch-projection";
import type { WorkflowNode } from "@/components/workflows/workflow-types";

type WorkflowCanvasEdgeNode = Pick<WorkflowNode, "id" | "node_key" | "position"> & {
  canvasWidth?: number;
  canvasHeight?: number;
};

export type WorkflowCanvasConnectionDraft = {
  sourceNodeId: string;
  from: CanvasPoint;
  to: CanvasPoint;
};

export function WorkflowCanvasEdges({
  activeValidationEdgeIds,
  connectionDraft,
  disabled,
  edges,
  hoveredEdgeId,
  nodeById,
  selectedEdgeId,
  canvasSize,
  onDeleteEdge,
  onHoverEdge,
  onSelectEdge,
}: {
  activeValidationEdgeIds: Set<string>;
  connectionDraft: WorkflowCanvasConnectionDraft | null;
  disabled?: boolean;
  edges: WorkflowCanvasDisplayEdge[];
  hoveredEdgeId: string | null;
  nodeById: Map<string, WorkflowCanvasEdgeNode>;
  selectedEdgeId: string | null;
  canvasSize: CanvasSize;
  onDeleteEdge: (edgeId: string) => void;
  onHoverEdge: (edgeId: string | null) => void;
  onSelectEdge: (edgeId: string) => void;
}) {
  return (
    <>
      <svg
        className="absolute inset-0 overflow-visible"
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
          const source = nodeById.get(edge.displaySourceNodeId || edge.source_node_id);
          const target = nodeById.get(edge.displayTargetNodeId || edge.target_node_id);
          if (!source || !target) return null;
          const hovered = hoveredEdgeId === edge.id;
          const selected = selectedEdgeId === edge.id;
          const validationActive = activeValidationEdgeIds.has(edge.id);
          const path = createConnectionPath(getOutputPoint(source), getInputPoint(target));

          return (
            <g key={edge.id}>
              <path
                data-workflow-edge-source-key={source.node_key}
                data-workflow-edge-target-key={target.node_key}
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="18"
                className="cursor-pointer"
                pointerEvents="stroke"
                onClick={() => {
                  if (!edge.readOnly) onSelectEdge(edge.id);
                }}
              />
              <path
                data-workflow-edge-validation-state={validationActive ? "active" : "idle"}
                d={path}
                fill="none"
                markerEnd="url(#workflow-arrow)"
                strokeDasharray={validationActive ? "7 9" : hovered ? "1 7" : undefined}
                strokeLinecap={validationActive || hovered ? "round" : undefined}
                stroke={validationActive || selected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                strokeWidth={validationActive || selected ? "3" : "2"}
                className={validationActive ? "animate-pulse" : "pointer-events-none"}
              />
            </g>
          );
        })}
        {connectionDraft ? (
          <path
            d={createConnectionPath(connectionDraft.from, connectionDraft.to)}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeDasharray="6 6"
            strokeWidth="2"
            className="pointer-events-none"
          />
        ) : null}
      </svg>
      {edges.map((edge) => {
        if (edge.readOnly) return null;
        const source = nodeById.get(edge.displaySourceNodeId || edge.source_node_id);
        const target = nodeById.get(edge.displayTargetNodeId || edge.target_node_id);
        if (!source || !target) return null;
        const sourcePoint = getOutputPoint(source);
        const targetPoint = getInputPoint(target);
        const left = (sourcePoint.x + targetPoint.x) / 2;
        const top = (sourcePoint.y + targetPoint.y) / 2;
        const selected = selectedEdgeId === edge.id;

        return (
          <div
            key={`${edge.id}-actions`}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
            style={{ left, top }}
          >
            {edge.label ? (
              <button
                data-edge-action="configure"
                data-workflow-edge-source-key={edge.dataSourceNodeKey || source.node_key}
                data-workflow-edge-target-key={edge.dataTargetNodeKey || target.node_key}
                type="button"
                className={[
                  "rounded-full border bg-background/95 px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur",
                  selected ? "border-primary text-primary" : "border-border text-muted-foreground",
                ].join(" ")}
                disabled={disabled}
                onClick={() => onSelectEdge(edge.id)}
              >
                {edge.label}
              </button>
            ) : (
              <button
                data-edge-action="configure"
                data-workflow-edge-source-key={edge.dataSourceNodeKey || source.node_key}
                data-workflow-edge-target-key={edge.dataTargetNodeKey || target.node_key}
                aria-label="配置连线"
                type="button"
                className={[
                  "flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition duration-150 ease-out hover:scale-[1.08] hover:border-primary/40 hover:text-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 motion-reduce:transform-none motion-reduce:transition-none",
                  selected ? "border-primary text-primary" : "border-border/80",
                ].join(" ")}
                disabled={disabled}
                onClick={() => onSelectEdge(edge.id)}
              >
                <GitBranch className="size-3.5" />
              </button>
            )}
            <button
              data-edge-action="delete"
              aria-label="删除连线"
              type="button"
              className="group flex size-6 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground shadow-sm transition duration-150 ease-out hover:scale-[1.08] hover:border-destructive/40 hover:bg-background hover:text-destructive hover:shadow-md focus:bg-background focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-background disabled:pointer-events-none disabled:opacity-40 motion-reduce:transform-none motion-reduce:transition-none"
              disabled={disabled}
              onBlur={() => onHoverEdge(null)}
              onClick={() => {
                onHoverEdge(null);
                onDeleteEdge(edge.id);
              }}
              onFocus={() => onHoverEdge(edge.id)}
              onPointerEnter={() => onHoverEdge(edge.id)}
              onPointerLeave={() => onHoverEdge(null)}
            >
              <X className="size-4 transition-transform duration-150 ease-out group-hover:rotate-90 motion-reduce:transform-none motion-reduce:transition-none" />
            </button>
          </div>
        );
      })}
    </>
  );
}
