"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FolderKanban, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  ProjectFilters,
  ProjectsPagination,
} from "@/components/projects/project-list-actions";
import {
  CreateProjectButton,
  type ProjectRecord,
} from "@/components/projects/project-mutations";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function ProjectsClientShell({
  projects,
  pagination,
  status,
  ownership,
  keyword,
  error,
}: {
  projects: ProjectRecord[];
  pagination: Pagination;
  status: string;
  ownership: string;
  keyword: string;
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
    <>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
            <FolderKanban data-icon="inline-start" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">项目管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              管理项目预算、施工状态、负责人和客户房产信息。当前筛选共 {pagination.total} 条记录。
            </p>
          </div>
        </div>
        <CreateProjectButton onSaved={refreshProjects} />
      </div>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>项目列表</CardTitle>
              <CardDescription>
                按状态、可见范围和关键词筛选项目，操作列固定在表格右侧。
              </CardDescription>
            </div>
            {pending ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新
              </Badge>
            ) : (
              <Badge variant="outline">
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
            )}
          </div>
          <ProjectFilters
            status={status}
            ownership={ownership}
            keyword={keyword}
            pending={pending}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="relative flex flex-col gap-4 p-0">
          <ProjectsTable projects={visibleProjects} onProjectChanged={refreshProjects} />
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>每页 {pagination.pageSize} 条，共 {pagination.total} 条</span>
              {pending ? (
                <Badge variant="secondary">
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  正在更新
                </Badge>
              ) : (
                <Badge variant="outline">
                  第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
                </Badge>
              )}
            </div>
            <ProjectsPagination
              pagination={pagination}
              status={status}
              ownership={ownership}
              keyword={keyword}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
