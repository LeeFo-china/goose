"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2, UsersRound } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  calculateCustomerListRowHeight,
  calculateCustomerListPageSize,
  CUSTOMER_TABLE_HEADER_HEIGHT,
  CUSTOMER_TABLE_ROW_HEIGHT,
} from "@/components/customers/customer-list-page-size";
import {
  buildCustomersHref,
  CustomerFilters,
  CustomersPagination,
} from "@/components/customers/customer-list-actions";
import {
  CreateCustomerButton,
  type CustomerRecord,
} from "@/components/customers/customer-mutations";
import { CustomersTable } from "@/components/customers/customers-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function CustomersClientShell({
  customers,
  pagination,
  status,
  source,
  customerOrigin,
  keyword,
  follow,
  error,
}: {
  customers: CustomerRecord[];
  pagination: Pagination;
  status: string;
  source: string;
  customerOrigin: string;
  keyword: string;
  follow: string;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [customerTableRowHeight, setCustomerTableRowHeight] = useState(
    CUSTOMER_TABLE_ROW_HEIGHT,
  );
  const tableViewportStyle = useMemo(() => ({
    "--customer-table-row-height": `${customerTableRowHeight}px`,
  }) as CSSProperties, [customerTableRowHeight]);

  const navigate = useCallback((href: string) => {
    startTransition(() => {
      router.push(href);
    });
  }, [router, startTransition]);

  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport || pending) return;

    let frameId = 0;
    const syncPageSize = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const viewportHeight = viewport.clientHeight;
        if (!viewportHeight) return;
        const headerHeight = measureElementHeight(
          viewport.querySelector("thead"),
          CUSTOMER_TABLE_HEADER_HEIGHT,
        );
        const scrollbarHeight = measureHorizontalScrollbarHeight(viewport);

        const nextPageSize = calculateCustomerListPageSize({
          viewportHeight,
          headerHeight,
          rowHeight: CUSTOMER_TABLE_ROW_HEIGHT,
          scrollbarHeight,
        });
        const nextRowHeight = calculateCustomerListRowHeight({
          viewportHeight,
          headerHeight,
          scrollbarHeight,
          pageSize: nextPageSize,
        });
        setCustomerTableRowHeight((current) =>
          current === nextRowHeight ? current : nextRowHeight
        );
        if (nextPageSize === pagination.pageSize) return;

        const nextTotalPages = Math.max(1, Math.ceil(pagination.total / nextPageSize));
        const nextPage = Math.min(pagination.page, nextTotalPages);
        navigate(buildCustomersHref({
          page: nextPage,
          pageSize: nextPageSize,
          status,
          source,
          customerOrigin,
          keyword,
          follow,
        }));
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
    customerOrigin,
    follow,
    keyword,
    navigate,
    pagination.page,
    pagination.pageSize,
    pagination.total,
    pending,
    source,
    status,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <UsersRound aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">客户管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              客户资料、负责人、来源状态和跟进计划。当前筛选共 {pagination.total} 条记录。
            </p>
          </div>
        </div>
        <CreateCustomerButton />
      </div>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <CustomerFilters
            status={status}
            source={source}
            customerOrigin={customerOrigin}
            keyword={keyword}
            follow={follow}
            pageSize={pagination.pageSize}
            pending={pending}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div
            ref={tableViewportRef}
            data-testid="customer-list-table-viewport"
            style={tableViewportStyle}
            className="min-h-0 flex-1 overflow-auto"
          >
            <CustomersTable customers={customers} />
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
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
              <span className="tabular-nums">当前显示 {customers.length} 条，共 {pagination.total} 条</span>
            </div>
            <CustomersPagination
              pagination={pagination}
              status={status}
              source={source}
              customerOrigin={customerOrigin}
              keyword={keyword}
              follow={follow}
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
