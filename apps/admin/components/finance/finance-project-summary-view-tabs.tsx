"use client";

import Link from "next/link";
import { type MouseEvent, type PointerEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type FinanceProjectSummaryView = "all" | "danger" | "info";

export function FinanceProjectSummaryViewTabs({
  activeView,
  hrefs,
}: {
  activeView: FinanceProjectSummaryView;
  hrefs: Record<FinanceProjectSummaryView, string>;
}) {
  const [pendingView, setPendingView] =
    useState<FinanceProjectSummaryView | null>(null);

  useEffect(() => {
    setPendingView(null);
  }, [activeView, hrefs.all, hrefs.danger, hrefs.info]);

  function handleNavigate(
    event: MouseEvent<HTMLAnchorElement>,
    view: FinanceProjectSummaryView,
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (view === activeView && !pendingView) {
      event.preventDefault();
      return;
    }

    setPendingView(view);
  }

  function handlePointerDown(
    event: PointerEvent<HTMLAnchorElement>,
    view: FinanceProjectSummaryView,
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (view !== activeView) setPendingView(view);
  }

  const tabs: Array<{ value: FinanceProjectSummaryView; label: string }> = [
    { value: "all", label: "全部项目" },
    { value: "danger", label: "高风险项目" },
    { value: "info", label: "待补基础数据" },
  ];

  return (
    <nav
      aria-label="项目财务明细视图"
      aria-busy={pendingView !== null || undefined}
      className="overflow-x-auto overflow-y-hidden"
    >
      <div className="flex min-w-max items-center gap-5">
        {tabs.map((tab) => {
          const active = tab.value === activeView;
          const pending = pendingView === tab.value;

          return (
            <Link
              key={tab.value}
              href={hrefs[tab.value]}
              aria-current={active ? "page" : undefined}
              onPointerDown={(event) => handlePointerDown(event, tab.value)}
              onClick={(event) => handleNavigate(event, tab.value)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                active && "border-primary text-foreground",
                pending && "text-foreground",
              )}
            >
              {pending ? (
                <Loader2
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                  data-testid={`finance-summary-view-tab-spinner-${tab.value}`}
                />
              ) : null}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
