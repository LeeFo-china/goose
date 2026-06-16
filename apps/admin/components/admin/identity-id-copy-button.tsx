"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getIdentityCopyMeta } from "./identity-copy-utils";

export function IdentityIdCopyButton({
  id,
  name,
  fallbackName,
  idLabel,
  className,
}: {
  id: string;
  name: string | null | undefined;
  fallbackName: string;
  idLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const identity = getIdentityCopyMeta({
    id,
    name,
    fallbackName,
  });

  async function copyIdentityId(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (!id) return;

    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success(`已复制${idLabel}`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(`复制失败，请手动复制${idLabel}`);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            "size-7 shrink-0 opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100",
            className,
          )}
          aria-label={`复制${idLabel}：${identity.name}`}
          onClick={copyIdentityId}
        >
          {copied ? (
            <Check className="text-primary" aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[320px]">
        <div className="flex flex-col gap-1">
          <div className="break-all font-semibold">{identity.name}</div>
          <div className="break-all font-mono text-xs tabular-nums opacity-90">
            {id}
          </div>
          <div className="text-xs opacity-80">
            {copied ? `已复制${idLabel}` : `点击复制${idLabel}`}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
