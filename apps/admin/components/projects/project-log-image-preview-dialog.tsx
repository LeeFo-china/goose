"use client";

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ProjectLogImagePreviewState = {
  images: string[];
  index: number;
  title: string;
} | null;

export function ProjectLogImagePreviewDialog({
  preview,
  onPreviewChange,
}: {
  preview: NonNullable<ProjectLogImagePreviewState>;
  onPreviewChange: (preview: ProjectLogImagePreviewState) => void;
}) {
  const imageCount = preview.images.length;
  const currentImage = preview.images[preview.index] || preview.images[0] || "";
  const canNavigate = imageCount > 1;

  const goToIndex = useCallback((nextIndex: number) => {
    if (imageCount === 0) return;
    onPreviewChange({
      ...preview,
      index: (nextIndex + imageCount) % imageCount,
    });
  }, [imageCount, onPreviewChange, preview]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && canNavigate) {
        event.preventDefault();
        goToIndex(preview.index - 1);
      }
      if (event.key === "ArrowRight" && canNavigate) {
        event.preventDefault();
        goToIndex(preview.index + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canNavigate, goToIndex, preview.index]);

  return (
    <Dialog open onOpenChange={(open) => !open && onPreviewChange(null)}>
      <DialogContent className="max-h-[92vh] max-w-[1040px] overflow-hidden p-0">
        <DialogHeader className="border-b p-5">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle>{preview.title}</DialogTitle>
              <DialogDescription>
                {preview.index + 1} / {imageCount}
              </DialogDescription>
            </div>
            {currentImage ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={currentImage} target="_blank" rel="noreferrer">
                  查看原图
                </a>
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <div className="relative flex h-[min(72vh,720px)] items-center justify-center bg-muted/40 p-4">
          {canNavigate ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/90"
              onClick={() => goToIndex(preview.index - 1)}
              aria-label="上一张"
            >
              <ChevronLeft />
            </Button>
          ) : null}

          {currentImage ? (
            <img
              src={currentImage}
              alt={`施工日志图片 ${preview.index + 1}`}
              className="max-h-full max-w-full rounded-md object-contain"
            />
          ) : (
            <div className="text-sm text-muted-foreground">图片不可用</div>
          )}

          {canNavigate ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/90"
              onClick={() => goToIndex(preview.index + 1)}
              aria-label="下一张"
            >
              <ChevronRight />
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
