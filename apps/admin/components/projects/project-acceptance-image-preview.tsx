"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

type HoverImagePreviewProps = {
  src: string | null | undefined;
  href?: string | null;
  alt: string;
  caption?: string;
  children: ReactNode;
  contentClassName?: string;
};

export function HoverImagePreview({
  src,
  href,
  alt,
  caption,
  children,
  contentClassName,
}: HoverImagePreviewProps) {
  if (!src) {
    return <>{children}</>;
  }

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={10}
        className={cn("w-[320px] p-2", contentClassName)}
      >
        <div className="overflow-hidden rounded-md border bg-muted">
          <img
            src={src}
            alt={alt}
            className="max-h-[260px] w-full object-contain"
          />
        </div>
        {(caption || href) ? (
          <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
            {caption ? <span className="min-w-0 truncate">{caption}</span> : <span />}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-foreground underline-offset-4 hover:underline"
              >
                原图
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
