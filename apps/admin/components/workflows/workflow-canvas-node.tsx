"use client";

import type { PointerEvent } from "react";
import { Settings } from "lucide-react";
import {
  HANDLE_HIT_SIZE,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "@/components/workflows/workflow-canvas-geometry";
import {
  getWorkflowNodeCapability,
  getWorkflowNodeDisplayLabels,
  type WorkflowNodeCapability,
} from "@/components/workflows/workflow-node-capabilities";
import type { WorkflowNode } from "@/components/workflows/workflow-types";

type WorkflowNodeVisualStyle = {
  accent: string;
  badge: string;
  dot: string;
};

const WORKFLOW_NODE_VISUAL_STYLES: Record<WorkflowNodeCapability, WorkflowNodeVisualStyle> = {
  business: {
    accent: "bg-sky-500",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  construction: {
    accent: "bg-indigo-500",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500",
  },
  procedure: {
    accent: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  payment_collection: {
    accent: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  finance: {
    accent: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
  },
  approval: {
    accent: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
  notification: {
    accent: "bg-cyan-500",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700",
    dot: "bg-cyan-500",
  },
  automation: {
    accent: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  subflow: {
    accent: "bg-slate-500",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-500",
  },
};

export function WorkflowCanvasNode({
  connecting,
  connectingNodeId,
  disabled,
  node,
  selected,
  onConnectionStart,
  onFinishConnect,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSelect,
}: {
  connecting: boolean;
  connectingNodeId: string | null;
  disabled?: boolean;
  node: WorkflowNode;
  selected: boolean;
  onConnectionStart: (
    event: PointerEvent<HTMLButtonElement>,
    node: WorkflowNode,
  ) => void;
  onFinishConnect: (nodeId: string) => void;
  onPointerCancel: () => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onSelect: (nodeId: string) => void;
}) {
  const capability = getWorkflowNodeCapability(node);
  const displayLabels = getWorkflowNodeDisplayLabels(node);
  const visualStyle = WORKFLOW_NODE_VISUAL_STYLES[capability];

  return (
    <div
      data-workflow-node="true"
      className={[
        "group absolute overflow-visible rounded-lg border bg-background text-left",
        "transform-gpu shadow-[0_8px_20px_hsl(var(--foreground)/0.06)]",
        "transition-[transform,box-shadow,border-color,background-color] duration-150",
        selected ? "z-30 scale-[1.08]" : "z-20 scale-100",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-move",
        connecting
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : selected
            ? "border-primary bg-primary/[0.03] ring-4 ring-primary/20 shadow-[0_18px_42px_hsl(var(--primary)/0.18)]"
            : "border-border hover:border-primary/45 hover:shadow-md",
      ].join(" ")}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute inset-y-2 left-2 w-1 rounded-full transition-opacity",
          visualStyle.accent,
          selected || connecting ? "opacity-100" : "opacity-70",
        ].join(" ")}
      />
      <button
        type="button"
        className="flex h-full min-w-0 flex-col justify-between border-0 bg-transparent py-3 pl-5 pr-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
      >
        <span
          className={[
            "inline-flex h-5 max-w-full items-center gap-1.5 self-start rounded-full border px-2 text-[11px] font-medium leading-none",
            visualStyle.badge,
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={["size-1.5 rounded-full", visualStyle.dot].join(" ")}
          />
          <span className="truncate">{displayLabels.capabilityLabel}</span>
        </span>
        <span className="block w-full truncate text-[15px] font-semibold leading-5 text-foreground">
          {displayLabels.specificLabel}
        </span>
      </button>
      {selected ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 right-2 z-10 flex size-6 items-center justify-center rounded-full border border-primary/25 bg-primary/8 text-primary shadow-sm"
        >
          <Settings className="size-3.5" />
        </span>
      ) : null}
      {node.node_type !== "start" ? (
        <button
          data-node-port="input"
          data-node-input="true"
          data-node-id={node.id}
          type="button"
          aria-label={`${displayLabels.specificLabel} 输入端口`}
          className={[
            "absolute top-1/2 rounded-full bg-transparent",
            "after:absolute after:left-1/2 after:top-1/2 after:size-2.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:bg-background after:shadow-sm",
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
            onFinishConnect(node.id);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onFinishConnect(node.id);
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
            "after:absolute after:left-1/2 after:top-1/2 after:size-2.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:bg-background after:shadow-sm",
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
          onPointerDown={(event) => onConnectionStart(event, node)}
        />
      ) : null}
    </div>
  );
}
