"use client";

import { LayoutDashboard, Link2, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkflowCanvasToolbar({
  disabled,
  edgeCount,
  nodeCount,
  zoom,
  onArrange,
}: {
  disabled?: boolean;
  edgeCount: number;
  nodeCount: number;
  zoom: number;
  onArrange: () => void;
}) {
  return (
    <div className="sticky left-3 top-3 z-30 h-0 w-fit">
      <div className="flex w-fit items-center gap-2 rounded-md border bg-background/95 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
        <MousePointer2 className="size-3.5" />
        <span>{nodeCount} 节点</span>
        <span className="text-border">|</span>
        <Link2 className="size-3.5" />
        <span>{edgeCount} 连线</span>
        <span className="text-border">|</span>
        <Button
          aria-label="整理画布"
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 px-2 text-muted-foreground"
          disabled={disabled || nodeCount === 0}
          onClick={onArrange}
        >
          <LayoutDashboard data-icon="inline-start" />
          整理画布
        </Button>
        <span data-workflow-canvas-zoom="true" className="w-10 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}
