"use client";

import { useState } from "react";
import { ExternalLink, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

type RotatableImagePreviewProps = {
  src: string;
  alt: string;
  label?: string;
  title?: string;
  className?: string;
  thumbnailClassName?: string;
  previewSide?: "top" | "right" | "bottom" | "left";
};

export function RotatableImagePreview({
  src,
  alt,
  label,
  title,
  className,
  thumbnailClassName,
  previewSide = "top",
}: RotatableImagePreviewProps) {
  const [rotation, setRotation] = useState(0);
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const rotateLeft = () => setRotation((value) => value - 90);
  const rotateRight = () => setRotation((value) => value + 90);
  const resetRotation = () => setRotation(0);

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "group overflow-hidden rounded-md border bg-background transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className={cn("h-24 w-full object-cover", thumbnailClassName)}
          />
          {label ? (
            <div className="truncate px-2 py-1.5 text-xs text-muted-foreground group-hover:text-foreground">
              {label}
            </div>
          ) : null}
        </a>
      </HoverCardTrigger>
      <HoverCardContent
        side={previewSide}
        align="center"
        sideOffset={10}
        className="w-[min(760px,calc(100vw-2rem))] p-2"
      >
        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{title || label || alt}</div>
            <div className="text-xs text-muted-foreground">旋转角度 {normalizedRotation}°</div>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="打开原图" asChild>
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" />
            </a>
          </Button>
        </div>
        <div className="flex h-[min(70vh,560px)] w-full items-center justify-center overflow-auto rounded-sm bg-muted/30">
          <img
            src={src}
            alt={`${alt}完整预览`}
            className="max-h-full max-w-full object-contain transition-transform duration-200 motion-reduce:transition-none"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>
        <div className="flex justify-center pt-2">
          <div className="flex items-center gap-1 rounded-md border bg-background p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="向左旋转"
              onClick={rotateLeft}
            >
              <RotateCcw data-icon="inline-start" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="重置旋转"
              onClick={resetRotation}
            >
              0°
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="向右旋转"
              onClick={rotateRight}
            >
              <RotateCw data-icon="inline-start" />
            </Button>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
