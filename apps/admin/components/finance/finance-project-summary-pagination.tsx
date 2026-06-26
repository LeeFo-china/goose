"use client";

import { type MouseEvent, type PointerEvent, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FinancePaginationTarget = "previous" | "next";

type FinanceProjectSummaryPaginationProps = {
  previousHref: string | null;
  nextHref: string | null;
  pendingTarget?: FinancePaginationTarget | null;
  onPendingTarget?: (target: FinancePaginationTarget | null) => void;
  onNavigate?: (target: FinancePaginationTarget, href: string) => void;
};

export function FinanceProjectSummaryPagination({
  previousHref,
  nextHref,
  pendingTarget,
  onPendingTarget,
  onNavigate,
}: FinanceProjectSummaryPaginationProps) {
  const [internalPendingTarget, setInternalPendingTarget] =
    useState<FinancePaginationTarget | null>(null);
  const currentPendingTarget = pendingTarget === undefined
    ? internalPendingTarget
    : pendingTarget;

  useEffect(() => {
    setPending(null);
  }, [previousHref, nextHref]);

  function setPending(target: FinancePaginationTarget | null) {
    if (pendingTarget === undefined) {
      setInternalPendingTarget(target);
    }
    onPendingTarget?.(target);
  }

  function handleNavigate(
    event: MouseEvent<HTMLAnchorElement>,
    target: FinancePaginationTarget,
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    if (currentPendingTarget && currentPendingTarget !== target) {
      event.preventDefault();
      return;
    }

    setPending(target);
    if (onNavigate) {
      const href = target === "previous" ? previousHref : nextHref;
      if (!href) return;
      event.preventDefault();
      onNavigate(target, href);
    }
  }

  function handlePointerDown(
    event: PointerEvent<HTMLAnchorElement>,
    target: FinancePaginationTarget,
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!currentPendingTarget) setPending(target);
  }

  const isNavigating = currentPendingTarget !== null;
  const previousPending = currentPendingTarget === "previous";
  const nextPending = currentPendingTarget === "next";
  const buttonClassName = "min-w-[5.5rem] gap-1.5";
  const navigatingClassName = isNavigating
    ? "opacity-60"
    : undefined;

  return (
    <div className="flex gap-2" aria-busy={isNavigating || undefined}>
      {previousHref ? (
        <Button asChild variant="outline" className={cn(buttonClassName, navigatingClassName)}>
          <a
            href={previousHref}
            aria-disabled={isNavigating && !previousPending || undefined}
            onPointerDown={(event) => handlePointerDown(event, "previous")}
            onClick={(event) => handleNavigate(event, "previous")}
          >
            {previousPending ? (
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin"
                data-testid="finance-pagination-previous-spinner"
              />
            ) : (
              <ChevronLeft aria-hidden="true" className="size-4" />
            )}
            上一页
          </a>
        </Button>
      ) : (
        <Button type="button" variant="outline" className={buttonClassName} disabled>
          <ChevronLeft aria-hidden="true" className="size-4" />
          上一页
        </Button>
      )}
      {nextHref ? (
        <Button asChild variant="outline" className={cn(buttonClassName, navigatingClassName)}>
          <a
            href={nextHref}
            aria-disabled={isNavigating && !nextPending || undefined}
            onPointerDown={(event) => handlePointerDown(event, "next")}
            onClick={(event) => handleNavigate(event, "next")}
          >
            下一页
            {nextPending ? (
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin"
                data-testid="finance-pagination-next-spinner"
              />
            ) : (
              <ChevronRight aria-hidden="true" className="size-4" />
            )}
          </a>
        </Button>
      ) : (
        <Button type="button" variant="outline" className={buttonClassName} disabled>
          下一页
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      )}
    </div>
  );
}
