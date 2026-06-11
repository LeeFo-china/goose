"use client";

import type { PointerEvent } from "react";
import { useRef } from "react";
import { GitBranch } from "lucide-react";
import {
  clampPosition,
  HANDLE_HIT_SIZE,
  type CanvasPoint,
  type CanvasSize,
} from "@/components/workflows/workflow-canvas-geometry";
import type {
  WorkflowCanvasBranchNode,
  WorkflowConnectionSource,
} from "@/components/workflows/workflow-branch-projection";
import type { WorkflowNode } from "@/components/workflows/workflow-types";

type BranchDragState = {
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
  zoom: number;
};

export function WorkflowCanvasBranchNode({
  branchNode,
  canvasSize,
  connecting,
  disabled,
  minNodePosition,
  zoom,
  onConnectionStart,
  onMove,
}: {
  branchNode: WorkflowCanvasBranchNode;
  canvasSize: CanvasSize;
  connecting?: boolean;
  disabled?: boolean;
  minNodePosition?: CanvasPoint;
  zoom: number;
  onConnectionStart: (
    event: PointerEvent<HTMLButtonElement>,
    source: WorkflowConnectionSource,
    outcomeIndex: number,
  ) => void;
  onMove: (sourceNodeId: string, position: WorkflowNode["position"]) => void;
}) {
  const dragRef = useRef<BranchDragState | null>(null);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("[data-workflow-branch-output]")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      originX: branchNode.position.x,
      originY: branchNode.position.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
      zoom,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    onMove(branchNode.sourceNodeId, clampPosition({
      x: drag.originX + (event.clientX - drag.pointerX) / drag.zoom,
      y: drag.originY + (event.clientY - drag.pointerY) / drag.zoom,
    }, canvasSize, minNodePosition, {
      width: branchNode.canvasWidth,
      height: branchNode.canvasHeight,
    }));
  }

  return (
    <div
      data-workflow-branch-source-key={branchNode.sourceNodeKey}
      className={[
        "absolute z-20 flex items-center justify-center",
        disabled ? "cursor-not-allowed" : "cursor-move",
        disabled ? "opacity-70" : null,
      ].filter(Boolean).join(" ")}
      style={{
        left: branchNode.position.x,
        top: branchNode.position.y,
        width: branchNode.canvasWidth,
        height: branchNode.canvasHeight,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
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
      {branchNode.outcomes.map((outcome, index) => {
        const tone = index === 0 ? "success" : "failure";
        const success = tone === "success";
        return (
          <button
            key={outcome.key}
            data-workflow-branch-output={outcome.key}
            data-workflow-branch-output-tone={tone}
            type="button"
            aria-label={`${branchNode.title}${outcome.label}出口`}
            className={[
              "absolute rounded-full bg-transparent",
              "after:absolute after:left-1/2 after:top-1/2 after:size-2.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:bg-background after:shadow-sm",
              success ? "after:border-emerald-500 after:bg-emerald-50" : "after:border-rose-500 after:bg-rose-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled ? "cursor-not-allowed" : "cursor-crosshair",
            ].join(" ")}
            disabled={disabled}
            style={{
              left: success
                ? branchNode.canvasWidth - HANDLE_HIT_SIZE / 2
                : branchNode.canvasWidth / 2 - HANDLE_HIT_SIZE / 2,
              top: success
                ? branchNode.canvasHeight / 2 - HANDLE_HIT_SIZE / 2
                : branchNode.canvasHeight - HANDLE_HIT_SIZE / 2,
              width: HANDLE_HIT_SIZE,
              height: HANDLE_HIT_SIZE,
            }}
            onPointerDown={(event) => onConnectionStart(event, {
              nodeId: branchNode.sourceNodeId,
              branchOutcome: outcome.key,
            }, index)}
          />
        );
      })}
    </div>
  );
}
