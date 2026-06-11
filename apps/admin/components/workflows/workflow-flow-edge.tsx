"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import type { WorkflowFlowEdge } from "@/components/workflows/workflow-flow-types";

export function WorkflowFlowEdge({
  data,
  id,
  markerEnd,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<WorkflowFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const active = Boolean(data?.active);
  const edge = data?.edge;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        data-workflow-edge-source-key={data?.pathSourceKey}
        data-workflow-edge-target-key={data?.pathTargetKey}
        data-workflow-edge-validation-state={active ? "active" : "idle"}
        data-workflow-edge-active={active ? "true" : "false"}
        className={[
          "workflow-flow-edge fill-none",
          active ? "animate-pulse stroke-primary" : "stroke-muted-foreground",
          active ? "workflow-flow-edge-dashed" : "",
        ].join(" ")}
        style={{
          strokeWidth: active ? 3 : 2,
          strokeLinecap: active ? "round" : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {edge?.label ? (
            <span
              data-workflow-edge-source-key={data?.actionSourceKey}
              data-workflow-edge-target-key={data?.actionTargetKey}
              className="rounded-full border border-border bg-background/95 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur"
            >
              {edge.label}
            </span>
          ) : null}
          {edge?.readOnly ? null : (
            <button
              data-edge-action="delete"
              data-workflow-edge-source-key={data?.actionSourceKey}
              data-workflow-edge-target-key={data?.actionTargetKey}
              aria-label="删除连线"
              type="button"
              className="group flex size-6 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground shadow-sm transition duration-150 ease-out hover:scale-[1.08] hover:border-destructive/40 hover:bg-background hover:text-destructive hover:shadow-md focus:bg-background focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-background disabled:pointer-events-none disabled:opacity-40 motion-reduce:transform-none motion-reduce:transition-none"
              disabled={data?.disabled}
              onClick={() => data?.onDeleteEdge(edge?.id || id)}
            >
              <X className="size-4 transition-transform duration-150 ease-out group-hover:rotate-90 motion-reduce:transform-none motion-reduce:transition-none" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
