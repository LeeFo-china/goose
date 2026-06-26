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
import { Loader2 } from "lucide-react";
import {
  buildDepartmentsHref,
  DepartmentFilters,
  DepartmentsPagination,
} from "@/components/organization/department-list-actions";
import { EnableDepartmentButton } from "@/components/organization/department-mutations";
import { DepartmentsTable } from "@/components/organization/departments-table";
import {
  calculateOrganizationListPageSize,
  calculateOrganizationListRowHeight,
  ORGANIZATION_TABLE_HEADER_HEIGHT,
  ORGANIZATION_TABLE_ROW_HEIGHT,
} from "@/components/organization/organization-list-page-size";
import type {
  DepartmentRecord,
  DepartmentPostRuleConfig,
  Pagination,
} from "@/components/organization/organization-types";
import { Badge } from "@/components/ui/badge";

export function DepartmentsClientShell({
  departments,
  departmentPostRuleConfig,
  pagination,
  code,
  keyword,
  enabledDepartmentCodes,
  onDepartmentDisabled,
  onDepartmentsEnabled,
  onDepartmentPostRuleConfigChange,
}: {
  departments: DepartmentRecord[];
  departmentPostRuleConfig: DepartmentPostRuleConfig;
  pagination: Pagination;
  code: string;
  keyword: string;
  enabledDepartmentCodes: string[];
  onDepartmentDisabled?: (code: string) => void;
  onDepartmentsEnabled?: (codes: string[]) => void;
  onDepartmentPostRuleConfigChange?: (config: DepartmentPostRuleConfig) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [departmentTableRowHeight, setDepartmentTableRowHeight] = useState(
    ORGANIZATION_TABLE_ROW_HEIGHT,
  );
  const [locallyDisabledCodes, setLocallyDisabledCodes] = useState<string[]>([]);
  const [locallyEnabledCodes, setLocallyEnabledCodes] = useState<string[]>([]);
  const [ruleConfig, setRuleConfig] = useState(departmentPostRuleConfig);
  const tableViewportStyle = useMemo(() => ({
    "--organization-table-row-height": `${departmentTableRowHeight}px`,
  }) as CSSProperties, [departmentTableRowHeight]);
  const syncedEnabledDepartmentCodes = useMemo(() => {
    const disabledSet = new Set(locallyDisabledCodes);
    return Array.from(new Set([
      ...enabledDepartmentCodes,
      ...locallyEnabledCodes,
    ])).filter((item) => !disabledSet.has(item));
  }, [enabledDepartmentCodes, locallyDisabledCodes, locallyEnabledCodes]);

  useEffect(() => {
    setRuleConfig(departmentPostRuleConfig);
  }, [departmentPostRuleConfig]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/backend/department-post-rules", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success !== false && payload?.data) {
          setRuleConfig(payload.data);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });

    return () => controller.abort();
  }, []);

  const navigate = useCallback((href: string) => {
    startTransition(() => {
      router.push(href);
      router.refresh();
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
          viewport.querySelector("[data-organization-table-header]"),
          ORGANIZATION_TABLE_HEADER_HEIGHT,
        );
        const scrollbarHeight = measureHorizontalScrollbarHeight(viewport);

        const nextPageSize = calculateOrganizationListPageSize({
          viewportHeight,
          headerHeight,
          rowHeight: ORGANIZATION_TABLE_ROW_HEIGHT,
          scrollbarHeight,
        });
        const nextRowHeight = calculateOrganizationListRowHeight({
          viewportHeight,
          headerHeight,
          scrollbarHeight,
          pageSize: nextPageSize,
        });
        setDepartmentTableRowHeight((current) =>
          current === nextRowHeight ? current : nextRowHeight
        );
        if (nextPageSize === pagination.pageSize) return;

        const nextTotalPages = Math.max(1, Math.ceil(pagination.total / nextPageSize));
        const nextPage = Math.min(pagination.page, nextTotalPages);
        navigate(buildDepartmentsHref({
          page: nextPage,
          pageSize: nextPageSize,
          code,
          keyword,
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
    code,
    keyword,
    navigate,
    pagination.page,
    pagination.pageSize,
    pagination.total,
    pending,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <DepartmentFilters
            code={code}
            keyword={keyword}
            pageSize={pagination.pageSize}
            pending={pending}
            onNavigate={navigate}
          />
          <EnableDepartmentButton
            enabledDepartmentCodes={syncedEnabledDepartmentCodes}
            onEnabled={(codes) => {
              setLocallyEnabledCodes((current) => Array.from(new Set([...current, ...codes])));
              setLocallyDisabledCodes((current) =>
                current.filter((item) => !codes.includes(item))
              );
              onDepartmentsEnabled?.(codes);
            }}
          />
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={tableViewportRef}
          data-testid="department-list-table-viewport"
          style={tableViewportStyle}
          className="min-h-0 flex-1 overflow-auto"
        >
          <DepartmentsTable
            departments={departments}
            departmentPostRuleConfig={ruleConfig}
            onDepartmentPostsSaved={(config) => {
              setRuleConfig(config);
              onDepartmentPostRuleConfigChange?.(config);
            }}
            onDepartmentDisabled={(disabledCode) => {
              setLocallyDisabledCodes((current) =>
                current.includes(disabledCode) ? current : [...current, disabledCode]
              );
              setLocallyEnabledCodes((current) =>
                current.filter((item) => item !== disabledCode)
              );
              onDepartmentDisabled?.(disabledCode);
            }}
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
            <span>
              当前显示 {departments.length} 条，共 {pagination.total} 条
            </span>
          </div>
          <DepartmentsPagination
            pagination={pagination}
            code={code}
            keyword={keyword}
            pageSize={pagination.pageSize}
            pending={pending}
            onNavigate={navigate}
          />
        </div>
      </div>
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
