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
import type { EmployeeStatus } from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  EmployeeSearchForm,
  EmployeesPagination,
  EmployeesStatusFilters,
  EmployeesStructuredFilters,
} from "@/components/employees/employee-list-actions";
import { buildEmployeesHref } from "@/components/employees/employee-list-filter-utils";
import {
  calculateEmployeeListPageSize,
  calculateEmployeeListRowHeight,
  EMPLOYEE_TABLE_HEADER_HEIGHT,
  EMPLOYEE_TABLE_ROW_HEIGHT,
} from "@/components/employees/employee-list-page-size";
import {
  EmployeesTable,
  type EmployeeRecord,
} from "@/components/employees/employees-table";
import type {
  EmployeeDepartmentOption,
  EmployeePostOption,
} from "@/components/employees/employee-mutations";
import type { RoleOption } from "@/components/employees/employee-mutation-shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type StatusOption = {
  label: string;
  value: "" | EmployeeStatus;
};

export function EmployeesClientShell({
  employees,
  pagination,
  status,
  keyword,
  tenantDepartmentId,
  postId,
  roleId,
  error,
  statusOptions,
  departments,
  posts,
  roles,
}: {
  employees: EmployeeRecord[];
  pagination: Pagination;
  status: string;
  keyword: string;
  tenantDepartmentId: string;
  postId: string;
  roleId: string;
  error: string | null;
  statusOptions: StatusOption[];
  departments: EmployeeDepartmentOption[];
  posts: EmployeePostOption[];
  roles: RoleOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [employeeTableRowHeight, setEmployeeTableRowHeight] = useState(
    EMPLOYEE_TABLE_ROW_HEIGHT,
  );
  const [measuredEmployeePageSize, setMeasuredEmployeePageSize] = useState<number | null>(null);
  const visibleEmployees = useMemo(() => {
    if (!measuredEmployeePageSize || employees.length <= measuredEmployeePageSize) {
      return employees;
    }

    return employees.slice(0, measuredEmployeePageSize);
  }, [employees, measuredEmployeePageSize]);
  const tableViewportStyle = useMemo(() => ({
    "--employee-table-row-height": `${employeeTableRowHeight}px`,
  }) as CSSProperties, [employeeTableRowHeight]);

  const navigate = useCallback((href: string) => {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }, [router, startTransition]);

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
        EMPLOYEE_TABLE_HEADER_HEIGHT,
      );
      const scrollbarHeight = measureHorizontalScrollbarHeight(viewport);

      const nextPageSize = calculateEmployeeListPageSize({
        viewportHeight,
        headerHeight,
        rowHeight: EMPLOYEE_TABLE_ROW_HEIGHT,
        scrollbarHeight,
      });
      const nextRowHeight = calculateEmployeeListRowHeight({
        viewportHeight,
        headerHeight,
        scrollbarHeight,
        pageSize: nextPageSize,
      });
      setMeasuredEmployeePageSize((current) =>
        current === nextPageSize ? current : nextPageSize
      );
      setEmployeeTableRowHeight((current) =>
        current === nextRowHeight ? current : nextRowHeight
      );
      if (nextPageSize === pagination.pageSize) return;

      const nextTotalPages = Math.max(1, Math.ceil(pagination.total / nextPageSize));
      const nextPage = Math.min(pagination.page, nextTotalPages);
      navigate(buildEmployeesHref({
        page: nextPage,
        pageSize: nextPageSize,
        status,
        keyword,
        tenantDepartmentId,
        postId,
        roleId,
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
    keyword,
    navigate,
    pagination.page,
    pagination.pageSize,
    pagination.total,
    pending,
    postId,
    roleId,
    status,
    tenantDepartmentId,
  ]);

  function refreshEmployees() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center">
              <EmployeesStatusFilters
                options={statusOptions}
                currentStatus={status}
                keyword={keyword}
                pageSize={pagination.pageSize}
                tenantDepartmentId={tenantDepartmentId}
                postId={postId}
                roleId={roleId}
                pending={pending}
                onNavigate={navigate}
              />
              <EmployeesStructuredFilters
                status={status}
                keyword={keyword}
                pageSize={pagination.pageSize}
                tenantDepartmentId={tenantDepartmentId}
                postId={postId}
                roleId={roleId}
                departments={departments}
                posts={posts}
                roles={roles}
                pending={pending}
                onNavigate={navigate}
              />
            </div>
            <EmployeeSearchForm
              status={status}
              keyword={keyword}
              pageSize={pagination.pageSize}
              tenantDepartmentId={tenantDepartmentId}
              postId={postId}
              roleId={roleId}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div
            ref={tableViewportRef}
            data-testid="employee-list-table-viewport"
            style={tableViewportStyle}
            className="min-h-0 flex-1 overflow-auto"
          >
            <EmployeesTable
              employees={visibleEmployees}
              departments={departments}
              posts={posts}
              onEmployeeChanged={refreshEmployees}
            />
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
              <span className="tabular-nums">
                当前显示 {visibleEmployees.length} 条，共 {pagination.total} 条
              </span>
            </div>
            <EmployeesPagination
              pagination={pagination}
              status={status}
              keyword={keyword}
              pageSize={pagination.pageSize}
              tenantDepartmentId={tenantDepartmentId}
              postId={postId}
              roleId={roleId}
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
