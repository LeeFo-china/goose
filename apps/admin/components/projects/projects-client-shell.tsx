"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FolderKanban, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  ProjectFilters,
  ProjectsPagination,
} from "@/components/projects/project-list-actions";
import type { ProjectWorkflowFiltersData } from "@/components/projects/project-list-filter-utils";
import {
  CreateProjectButton,
  type ProjectRecord,
} from "@/components/projects/project-mutations";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

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
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <FolderKanban aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">项目管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              项目预算、施工状态、负责人和客户房产信息。当前筛选共 {pagination.total} 条记录。
            </p>
          </div>
        </div>
        <CreateProjectButton onSaved={refreshProjects} />
      </div>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <ProjectFilters
            ownership={ownership}
            keyword={keyword}
            workflowGroupKey={workflowGroupKey}
            workflowNodeKey={workflowNodeKey}
            workflowInstanceStatus={workflowInstanceStatus}
            workflowFilters={workflowFilters}
            pending={pending}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <ProjectsTable projects={visibleProjects} onProjectChanged={refreshProjects} />
          </div>
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {pending ? (
                <Badge variant="secondary">
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  正在更新
                </Badge>
              ) : (
                <Badge variant="outline" className="tabular-nums">
                  第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
                </Badge>
              )}
              <span className="tabular-nums">
                当前显示 {visibleProjects.length} 条，共 {pagination.total} 条
              </span>
            </div>
            <ProjectsPagination
              pagination={pagination}
              ownership={ownership}
              keyword={keyword}
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
