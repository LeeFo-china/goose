"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CaseListItem } from "@/components/marketing/h5-page-editor-types";
import { IMAGE_VIEWER_SLIDE_GAP } from "@/components/marketing/h5-page-editor-types";
import {
  clampNumber,
  normalizeCaseImageUrls,
  previewImage,
} from "@/components/marketing/h5-page-editor-block-utils";
import { cn } from "@/lib/utils";

export function CaseImageCarouselPreview({
  item,
}: {
  item: CaseListItem;
}) {
  const imageUrls = normalizeCaseImageUrls(item);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const currentImageUrl = imageUrls[0] || "";
  const safeViewerIndex = viewerIndex === null || imageUrls.length === 0
    ? 0
    : clampNumber(viewerIndex, 0, imageUrls.length - 1);
  const touchStartXRef = useRef<number | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const viewerTimerRef = useRef<number | null>(null);
  const [viewerOffset, setViewerOffset] = useState(0);
  const [viewerAnimated, setViewerAnimated] = useState(false);
  const viewerSlides = [
    imageUrls[safeViewerIndex - 1] || "",
    imageUrls[safeViewerIndex] || "",
    imageUrls[safeViewerIndex + 1] || "",
  ];
  const canSwitchViewerImage = (direction: -1 | 1) => (
    imageUrls.length > 1
    && safeViewerIndex + direction >= 0
    && safeViewerIndex + direction < imageUrls.length
  );

  useEffect(() => () => {
    if (viewerTimerRef.current) {
      window.clearTimeout(viewerTimerRef.current);
      viewerTimerRef.current = null;
    }
  }, []);

  const switchViewerImage = (direction: -1 | 1) => {
    if (viewerTimerRef.current) return;

    if (!canSwitchViewerImage(direction)) {
      setViewerAnimated(true);
      setViewerOffset(0);
      window.setTimeout(() => setViewerAnimated(false), 220);
      return;
    }

    const width = (viewerRef.current?.clientWidth || window.innerWidth) + IMAGE_VIEWER_SLIDE_GAP;
    setViewerAnimated(true);
    setViewerOffset(direction > 0 ? -width : width);
    viewerTimerRef.current = window.setTimeout(() => {
      setViewerAnimated(false);
      setViewerIndex(safeViewerIndex + direction);
      setViewerOffset(0);
      viewerTimerRef.current = null;
    }, 270);
  };

  return (
    <>
      <div
        role={currentImageUrl ? "button" : undefined}
        tabIndex={currentImageUrl ? 0 : undefined}
        className={cn(
          "relative grid aspect-[16/9] place-items-center overflow-hidden bg-muted text-xs text-muted-foreground",
          currentImageUrl && "cursor-zoom-in",
        )}
        onClick={(event) => {
          if (!currentImageUrl) return;
          event.stopPropagation();
          setViewerIndex(0);
        }}
        onKeyDown={(event) => {
          if (!currentImageUrl || event.key !== "Enter") return;
          event.stopPropagation();
          setViewerIndex(0);
        }}
      >
        {currentImageUrl
          ? previewImage(currentImageUrl, item.title || "案例图片", "size-full object-cover")
          : "案例图片"}
        {imageUrls.length > 1 ? (
          <div className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] leading-5 text-white">
            1/{imageUrls.length}
          </div>
        ) : null}
      </div>

      <Dialog open={viewerIndex !== null} onOpenChange={(open) => {
        if (!open) {
          setViewerIndex(null);
          setViewerOffset(0);
          setViewerAnimated(false);
          if (viewerTimerRef.current) {
            window.clearTimeout(viewerTimerRef.current);
            viewerTimerRef.current = null;
          }
        }
      }}>
        <DialogContent className="max-h-[92vh] max-w-[92vw] border-0 bg-black/95 p-3 text-white shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>案例图片浏览</DialogTitle>
            <DialogDescription>查看当前案例的图片</DialogDescription>
          </DialogHeader>
          <div
            ref={viewerRef}
            className="relative grid min-h-[70vh] place-items-center"
            onTouchStart={(event) => {
              setViewerAnimated(false);
              touchStartXRef.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchMove={(event) => {
              const startX = touchStartXRef.current;
              if (startX === null || imageUrls.length <= 1) return;

              const currentX = event.touches[0]?.clientX ?? startX;
              setViewerOffset(currentX - startX);
              event.preventDefault();
            }}
            onTouchEnd={(event) => {
              const startX = touchStartXRef.current;
              touchStartXRef.current = null;
              if (startX === null || imageUrls.length <= 1) return;

              const endX = event.changedTouches[0]?.clientX ?? startX;
              const deltaX = endX - startX;
              if (Math.abs(deltaX) < 40) {
                setViewerAnimated(true);
                setViewerOffset(0);
                window.setTimeout(() => setViewerAnimated(false), 220);
                return;
              }

              switchViewerImage(deltaX < 0 ? 1 : -1);
            }}
          >
            <div className="w-full max-w-[900px] overflow-hidden">
              <div
                className={cn(
                  "flex h-[70vh] gap-[22px] will-change-transform",
                  viewerAnimated && "transition-transform duration-[260ms] ease-out",
                )}
                style={{
                  transform: `translate3d(calc(-100% - ${IMAGE_VIEWER_SLIDE_GAP}px + ${viewerOffset}px), 0, 0)`,
                }}
              >
                {viewerSlides.map((imageUrl, index) => (
                  <div key={`${imageUrl}-${index}`} className="grid min-w-full place-items-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.title || "案例图片"}
                        draggable={false}
                        className="max-h-[70vh] max-w-full select-none rounded-xl object-contain shadow-2xl"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            {imageUrls.length > 1 ? (
              <>
                {canSwitchViewerImage(-1) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="上一张案例图"
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-white/95 text-foreground shadow-lg hover:bg-white"
                    onClick={() => switchViewerImage(-1)}
                  >
                    <ArrowLeft />
                  </Button>
                ) : null}
                {canSwitchViewerImage(1) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="下一张案例图"
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-white/95 text-foreground shadow-lg hover:bg-white"
                    onClick={() => switchViewerImage(1)}
                  >
                    <ArrowRight />
                  </Button>
                ) : null}
              </>
            ) : null}
            {imageUrls.length > 1 ? (
              <div className="absolute bottom-7 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs">
                {safeViewerIndex + 1}/{imageUrls.length}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

