"use client";

import type { PointerEvent } from "react";
import { GitBranch } from "lucide-react";
import {
  HANDLE_HIT_SIZE,
} from "@/components/workflows/workflow-canvas-geometry";
import type {
  WorkflowCanvasBranchNode,
  WorkflowConnectionSource,
} from "@/components/workflows/workflow-branch-projection";

export function WorkflowCanvasBranchNode({
  branchNode,
  connecting,
  disabled,
  onConnectionStart,
}: {
  branchNode: WorkflowCanvasBranchNode;
  connecting?: boolean;
  disabled?: boolean;
  onConnectionStart: (
    event: PointerEvent<HTMLButtonElement>,
    source: WorkflowConnectionSource,
    outcomeIndex: number,
  ) => void;
}) {
  return (
    <div
      data-workflow-branch-source-key={branchNode.sourceNodeKey}
      className={[
        "absolute z-20 flex items-center justify-center",
        disabled ? "opacity-70" : null,
      ].filter(Boolean).join(" ")}
      style={{
        left: branchNode.position.x,
        top: branchNode.position.y,
        width: branchNode.canvasWidth,
        height: branchNode.canvasHeight,
      }}
    >
      <div
        className={[
          "relative flex size-[74px] rotate-45 items-center justify-center rounded-md border bg-amber-50 text-amber-800 shadow-[0_8px_20px_hsl(var(--foreground)/0.07)]",
          connecting ? "border-primary ring-4 ring-primary/15" : "border-amber-200",
        ].join(" ")}
      >
        <div className="-rotate-45 text-center">
          <GitBranch className="mx-auto mb-1 size-3.5" />
          <div className="text-[12px] font-semibold leading-tight">
            {branchNode.title}
          </div>
        </div>
      </div>
      {branchNode.outcomes.map((outcome, index) => (
        <button
          key={outcome.key}
          data-workflow-branch-output={outcome.key}
          type="button"
          aria-label={`${branchNode.title}${outcome.label}出口`}
          className={[
            "absolute right-0 rounded-full bg-transparent",
            "after:absolute after:left-1/2 after:top-1/2 after:size-2.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:border-primary after:bg-background after:shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            disabled ? "cursor-not-allowed" : "cursor-crosshair",
          ].join(" ")}
          disabled={disabled}
          style={{
            top: index === 0 ? 0 : branchNode.canvasHeight - HANDLE_HIT_SIZE,
            width: HANDLE_HIT_SIZE,
            height: HANDLE_HIT_SIZE,
          }}
          onPointerDown={(event) => onConnectionStart(event, {
            nodeId: branchNode.sourceNodeId,
            branchOutcome: outcome.key,
          }, index)}
        >
          <span className="absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded-full border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm">
            {outcome.label}
          </span>
        </button>
      ))}
    </div>
  );
}
