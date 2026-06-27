"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  WorkflowFilters,
  WorkflowPagination,
} from "@/components/workflows/workflow-list-actions";
import { buildWorkflowsHref } from "@/components/workflows/workflow-list-filter-utils";
import {
  calculateWorkflowListPageSize,
  calculateWorkflowListRowHeight,
  WORKFLOW_TABLE_HEADER_HEIGHT,
  WORKFLOW_TABLE_ROW_HEIGHT,
} from "@/components/workflows/workflow-list-page-size";
import { WorkflowTable } from "@/components/workflows/workflow-table";
import type {
  WorkflowDefinition,
  WorkflowPagination as WorkflowPaginationMeta,
} from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function WorkflowListShell({
  workflows,
  pagination,
  status,
  category,
  keyword,
  error,
}: {
  workflows: WorkflowDefinition[];
  pagination: WorkflowPaginationMeta;
  status: string;
  category: string;
  keyword: string;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [workflowTableRowHeight, setWorkflowTableRowHeight] = useState(
    WORKFLOW_TABLE_ROW_HEIGHT,
  );
  const [measuredWorkflowPageSize, setMeasuredWorkflowPageSize] = useState<number | null>(null);
  const visibleWorkflows = useMemo(() => {
    if (!measuredWorkflowPageSize || workflows.length <= measuredWorkflowPageSize) {
      return workflows;
    }

    return workflows.slice(0, measuredWorkflowPageSize);
  }, [measuredWorkflowPageSize, workflows]);
  const tableViewportStyle = useMemo(() => ({
    "--workflow-table-row-height": `${workflowTableRowHeight}px`,
  }) as CSSProperties, [workflowTableRowHeight]);

  const navigate = useCallback((href: string) => {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }, [router, startTransition]);

  function refreshList(href?: string) {
    startTransition(() => {
      if (href) router.push(href);
      router.refresh();
    });
  }

  useLayoutEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport || pending) return;

    let frameId = 0;
    const syncPageSize = () => {
      window.cancelAnimationFrame(frameId);
      const viewportHeight = viewport.clientHeight;
      if (!viewportHeight) return;
      const headerHeight = measureElementHeight(
        viewport.querySelector("thead"),
        WORKFLOW_TABLE_HEADER_HEIGHT,
      );
      const scrollbarHeight = measureHorizontalScrollbarHeight(viewport);

      const nextPageSize = calculateWorkflowListPageSize({
        viewportHeight,
        headerHeight,
        rowHeight: WORKFLOW_TABLE_ROW_HEIGHT,
        scrollbarHeight,
      });
      const nextRowHeight = calculateWorkflowListRowHeight({
        viewportHeight,
        headerHeight,
        scrollbarHeight,
        pageSize: nextPageSize,
      });
      setMeasuredWorkflowPageSize((current) =>
        current === nextPageSize ? current : nextPageSize
      );
      setWorkflowTableRowHeight((current) =>
        current === nextRowHeight ? current : nextRowHeight
      );
      if (nextPageSize === pagination.pageSize) return;

      const nextTotalPages = Math.max(1, Math.ceil(pagination.total / nextPageSize));
      const nextPage = Math.min(pagination.page, nextTotalPages);
      navigate(buildWorkflowsHref({
        page: nextPage,
        pageSize: nextPageSize,
        status,
        category,
        keyword,
      }));
    };
    const schedulePageSizeSync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncPageSize);
    };

    syncPageSize();

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(schedulePageSizeSync);
    resizeObserver?.observe(viewport);
    window.addEventListener("resize", schedulePageSizeSync);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePageSizeSync);
    };
  }, [
    category,
    keyword,
    navigate,
    pagination.page,
    pagination.pageSize,
    pagination.total,
    pending,
    status,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <WorkflowFilters
            status={status}
            category={category}
            keyword={keyword}
            pageSize={pagination.pageSize}
            pending={pending}
            onNavigate={navigate}
            onCreated={(workflow) => refreshList(`/workflows/${workflow.id}`)}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div
            ref={tableViewportRef}
            data-testid="workflow-list-table-viewport"
            style={tableViewportStyle}
            className="min-h-0 flex-1 overflow-auto"
          >
            <WorkflowTable workflows={visibleWorkflows} />
          </div>
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/65 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新流程列表
              </div>
            </div>
          ) : null}
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="tabular-nums">
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
              <span className="tabular-nums">
                当前显示 {visibleWorkflows.length} 条，共 {pagination.total} 条
              </span>
            </div>
            <WorkflowPagination
              pagination={pagination}
              status={status}
              category={category}
              keyword={keyword}
              pageSize={pagination.pageSize}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function measureElementHeight(
  element: Element | null,
  fallback: number | undefined,
) {
  if (!(element instanceof HTMLElement)) return fallback;

  const height = Math.ceil(element.getBoundingClientRect().height);
  return height > 0 ? height : fallback;
}

function measureHorizontalScrollbarHeight(viewport: HTMLElement) {
  const scroller = viewport.firstElementChild;
  if (!(scroller instanceof HTMLElement)) return 0;

  return Math.max(0, scroller.offsetHeight - scroller.clientHeight);
}
