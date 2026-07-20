"use client";

import Link from "next/link";
import { type MouseEvent, type PointerEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminTabsListClassName, adminTabsTriggerWithBadgeClassName } from "@/components/admin/admin-tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type FinanceProjectSummaryView = "all" | "danger" | "info";

export function FinanceProjectSummaryViewTabs({
  activeView,
  hrefs,
  pendingView,
  onPendingView,
  onNavigate,
}: {
  activeView: FinanceProjectSummaryView;
  hrefs: Record<FinanceProjectSummaryView, string>;
  pendingView?: FinanceProjectSummaryView | null;
  onPendingView?: (view: FinanceProjectSummaryView | null) => void;
  onNavigate?: (view: FinanceProjectSummaryView, href: string) => void;
}) {
  const [internalPendingView, setInternalPendingView] =
    useState<FinanceProjectSummaryView | null>(null);
  const currentPendingView = pendingView === undefined
    ? internalPendingView
    : pendingView;

  useEffect(() => {
    setPending(null);
  }, [activeView, hrefs.all, hrefs.danger, hrefs.info]);

  function setPending(view: FinanceProjectSummaryView | null) {
    if (pendingView === undefined) {
      setInternalPendingView(view);
    }
    onPendingView?.(view);
  }

  function handleNavigate(
    event: MouseEvent<HTMLAnchorElement>,
    view: FinanceProjectSummaryView,
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (view === activeView && !currentPendingView) {
      event.preventDefault();
      return;
    }

    setPending(view);
    if (onNavigate) {
      event.preventDefault();
      onNavigate(view, hrefs[view]);
    }
  }

  function handlePointerDown(
    event: PointerEvent<HTMLAnchorElement>,
    view: FinanceProjectSummaryView,
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (view !== activeView) setPending(view);
  }

  const tabs: Array<{ value: FinanceProjectSummaryView; label: string }> = [
    { value: "all", label: "全部项目" },
    { value: "danger", label: "高风险项目" },
    { value: "info", label: "待补基础数据" },
  ];

  return (
    <Tabs
      value={activeView}
      aria-label="项目财务明细视图"
      aria-busy={currentPendingView !== null || undefined}
      className="overflow-x-auto overflow-y-hidden"
    >
      <TabsList className={adminTabsListClassName}>
        {tabs.map((tab) => {
          const pending = currentPendingView === tab.value;

          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              asChild
              className={adminTabsTriggerWithBadgeClassName}
            >
              <Link
                href={hrefs[tab.value]}
                onPointerDown={(event) => handlePointerDown(event, tab.value)}
                onClick={(event) => handleNavigate(event, tab.value)}
              >
                {pending ? (
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                    data-testid={`finance-summary-view-tab-spinner-${tab.value}`}
                  />
                ) : null}
                {tab.label}
              </Link>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
