"use client";

import { LayoutDashboard, Link2, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkflowCanvasToolbar({
  disabled,
  edgeCount,
  nodeCount,
  zoom,
  minZoom,
  maxZoom,
  onArrange,
  onZoomIn,
  onZoomOut,
}: {
  disabled?: boolean;
  edgeCount: number;
  nodeCount: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onArrange: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
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
        <Button
          aria-label="缩小画布"
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 text-muted-foreground"
          disabled={disabled || zoom <= minZoom}
          onClick={onZoomOut}
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <span data-workflow-canvas-zoom="true" className="w-10 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          aria-label="放大画布"
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 text-muted-foreground"
          disabled={disabled || zoom >= maxZoom}
          onClick={onZoomIn}
        >
          <ZoomIn className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
