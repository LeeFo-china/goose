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
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  ProjectFilters,
  ProjectsPagination,
} from "@/components/projects/project-list-actions";
import {
  buildProjectsHref,
  type ProjectWorkflowFiltersData,
} from "@/components/projects/project-list-filter-utils";
import {
  calculateProjectListRowHeight,
  calculateProjectListPageSize,
  PROJECT_TABLE_HEADER_HEIGHT,
  PROJECT_TABLE_ROW_HEIGHT,
} from "@/components/projects/project-list-page-size";
import { persistProjectListPageSize } from "@/components/projects/project-list-page-size-preference";
import {
  CreateProjectButton,
  type ProjectRecord,
} from "@/components/projects/project-mutations";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type NavigateOptions = {
  replace?: boolean;
};

export function ProjectsClientShell({
  projects,
  pagination,
  ownership,
  keyword,
  workflowGroupKey,
  workflowNodeKey,
  workflowInstanceStatus,
  workflowFilters,
  sectionTabs,
  error,
}: {
  projects: ProjectRecord[];
  pagination: Pagination;
  ownership: string;
  keyword: string;
  workflowGroupKey: string;
  workflowNodeKey: string;
  workflowInstanceStatus: string;
  workflowFilters: ProjectWorkflowFiltersData;
  sectionTabs?: ReactNode;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [projectTableRowHeight, setProjectTableRowHeight] = useState(
    PROJECT_TABLE_ROW_HEIGHT,
  );
  const [projectOverrides, setProjectOverrides] = useState<Record<string, ProjectRecord>>({});
  const visibleProjects = useMemo(() => {
    const visibleIds = new Set(projects.map((project) => project.id));
    const patchedProjects = projects.map((project) =>
      projectOverrides[project.id] ? { ...project, ...projectOverrides[project.id] } : project
    );
    const optimisticProjects = Object.values(projectOverrides).filter(
      (project) => !visibleIds.has(project.id),
    );
    return [...optimisticProjects, ...patchedProjects];
  }, [projectOverrides, projects]);
  const tableViewportStyle = useMemo(() => ({
    "--project-table-row-height": `${projectTableRowHeight}px`,
  }) as CSSProperties, [projectTableRowHeight]);

  const navigate = useCallback((href: string, options?: NavigateOptions) => {
    startTransition(() => {
      if (options?.replace) {
        router.replace(href);
        return;
      }

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
          PROJECT_TABLE_HEADER_HEIGHT,
        );
        const scrollbarHeight = measureHorizontalScrollbarHeight(viewport);

        const nextPageSize = calculateProjectListPageSize({
          viewportHeight,
          headerHeight,
          rowHeight: PROJECT_TABLE_ROW_HEIGHT,
          scrollbarHeight,
        });
        const nextRowHeight = calculateProjectListRowHeight({
          viewportHeight,
          headerHeight,
          scrollbarHeight,
          pageSize: nextPageSize,
        });
        setProjectTableRowHeight((current) =>
          current === nextRowHeight ? current : nextRowHeight
        );
        persistProjectListPageSize(nextPageSize);
        if (nextPageSize === pagination.pageSize) return;

        const nextTotalPages = Math.max(1, Math.ceil(pagination.total / nextPageSize));
        const nextPage = Math.min(pagination.page, nextTotalPages);
        navigate(buildProjectsHref({
          page: nextPage,
          pageSize: nextPageSize,
          ownership,
          keyword,
          workflowGroupKey,
          workflowNodeKey,
          workflowInstanceStatus,
        }), { replace: true });
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
    keyword,
    navigate,
    ownership,
    pagination.page,
    pagination.pageSize,
    pagination.total,
    pending,
    workflowGroupKey,
    workflowInstanceStatus,
    workflowNodeKey,
  ]);

  function refreshProjects(project?: ProjectRecord) {
    if (project?.id) {
      setProjectOverrides((current) => ({
        ...current,
        [project.id]: current[project.id]
          ? { ...current[project.id], ...project }
          : project,
      }));
      return;
    } else {
      setProjectOverrides({});
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <h1 className="sr-only">项目管理</h1>
      <div className="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {sectionTabs ? (
          <div className="min-w-0">{sectionTabs}</div>
        ) : null}
        <div className="self-end md:ml-auto md:self-auto">
          <CreateProjectButton onSaved={refreshProjects} />
        </div>
      </div>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <ProjectFilters
            ownership={ownership}
            keyword={keyword}
            pageSize={pagination.pageSize}
            workflowGroupKey={workflowGroupKey}
            workflowNodeKey={workflowNodeKey}
            workflowInstanceStatus={workflowInstanceStatus}
            workflowFilters={workflowFilters}
            pending={pending}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div
            ref={tableViewportRef}
            data-testid="project-list-table-viewport"
            style={tableViewportStyle}
            className="min-h-0 flex-1 overflow-auto"
          >
            <TooltipProvider delayDuration={0} skipDelayDuration={100}>
              <ProjectsTable projects={visibleProjects} onProjectChanged={refreshProjects} />
            </TooltipProvider>
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
                当前显示 {visibleProjects.length} 条，共 {pagination.total} 条
              </span>
            </div>
            <ProjectsPagination
              pagination={pagination}
              ownership={ownership}
              keyword={keyword}
              pageSize={pagination.pageSize}
              workflowGroupKey={workflowGroupKey}
              workflowNodeKey={workflowNodeKey}
              workflowInstanceStatus={workflowInstanceStatus}
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
