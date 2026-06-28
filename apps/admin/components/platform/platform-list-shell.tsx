"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  calculatePlatformListPageSize,
  calculatePlatformListRowHeight,
  PLATFORM_LIST_TABLE_HEADER_HEIGHT,
  PLATFORM_LIST_TABLE_ROW_HEIGHT,
} from "@/components/platform/platform-list-page-size";

export type PlatformListPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function PlatformListPageShell({
  title,
  description,
  leading,
  titleMeta,
  action,
  error,
  summary,
  tabs,
  listHeader,
  filters,
  children,
  pagination,
  tableViewportTestId,
  pageKey = "page",
  pageSizeKey = "pageSize",
  unit = "条",
  currentCount,
  rowHeight = PLATFORM_LIST_TABLE_ROW_HEIGHT,
  headerHeight = PLATFORM_LIST_TABLE_HEADER_HEIGHT,
}: {
  title: string;
  description: ReactNode;
  leading?: ReactNode;
  titleMeta?: ReactNode;
  action?: ReactNode;
  error?: string | null;
  summary?: ReactNode;
  tabs?: ReactNode;
  listHeader?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
  pagination: PlatformListPagination;
  tableViewportTestId: string;
  pageKey?: string;
  pageSizeKey?: string;
  unit?: string;
  currentCount?: number;
  rowHeight?: number;
  headerHeight?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [tableRowHeight, setTableRowHeight] = useState(rowHeight);
  const visibleCount = currentCount ?? Math.min(pagination.pageSize, pagination.total);
  const totalPages = Math.max(1, pagination.totalPages || 1);
  const tableViewportStyle = useMemo(
    () => ({
      "--platform-list-row-height": `${tableRowHeight}px`,
    }) as CSSProperties,
    [tableRowHeight],
  );

  const navigate = useCallback((
    nextPage: number,
    nextPageSize: number,
  ) => {
    if (typeof window === "undefined") return;

    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      if (nextPage > 1) {
        params.set(pageKey, String(nextPage));
      } else {
        params.delete(pageKey);
      }
      params.set(pageSizeKey, String(nextPageSize));

      const query = params.toString();
      router.push(query ? `${window.location.pathname}?${query}` : window.location.pathname);
      router.refresh();
    });
  }, [pageKey, pageSizeKey, router, startTransition]);

  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport || pending) return;

    let frameId = 0;
    const syncPageSize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const viewportHeight = viewport.clientHeight;
        if (!viewportHeight) return;

        const measuredHeaderHeight = measureElementHeight(
          viewport.querySelector("thead"),
          headerHeight,
        );
        const scrollbarHeight = measureHorizontalScrollbarHeight(viewport);
        const nextPageSize = calculatePlatformListPageSize({
          viewportHeight,
          headerHeight: measuredHeaderHeight,
          rowHeight,
          scrollbarHeight,
        });
        const nextRowHeight = calculatePlatformListRowHeight({
          viewportHeight,
          headerHeight: measuredHeaderHeight,
          scrollbarHeight,
          pageSize: nextPageSize,
          minRowHeight: rowHeight,
        });

        setTableRowHeight((current) =>
          current === nextRowHeight ? current : nextRowHeight
        );
        if (nextPageSize === pagination.pageSize) return;

        const nextTotalPages = Math.max(1, Math.ceil(pagination.total / nextPageSize));
        const nextPage = Math.min(pagination.page, nextTotalPages);
        navigate(nextPage, nextPageSize);
      });
    };

    syncPageSize();

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(syncPageSize);
    resizeObserver?.observe(viewport);
    window.addEventListener("resize", syncPageSize);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncPageSize);
    };
  }, [
    headerHeight,
    navigate,
    pagination.page,
    pagination.pageSize,
    pagination.total,
    pending,
    rowHeight,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          {leading}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
              {titleMeta}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {summary}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          {tabs}
          {listHeader}
          {filters}
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div
            ref={tableViewportRef}
            data-testid={tableViewportTestId}
            style={tableViewportStyle}
            className="min-h-0 flex-1 overflow-auto"
          >
            {children}
          </div>
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/65 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="tabular-nums">
                第 {pagination.page} / {totalPages} 页
              </Badge>
              <span className="tabular-nums">
                当前显示 {visibleCount} {unit}，共 {pagination.total} {unit}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pagination.page <= 1 || pending}
                onClick={() => navigate(Math.max(1, pagination.page - 1), pagination.pageSize)}
              >
                <ChevronLeft data-icon="inline-start" />
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pagination.page >= totalPages || pending}
                onClick={() => navigate(pagination.page + 1, pagination.pageSize)}
              >
                下一页
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
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
