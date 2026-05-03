"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  ProjectFilters,
  ProjectsPagination,
} from "@/components/projects/project-list-actions";
import { type ProjectRecord } from "@/components/projects/project-mutations";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <ProjectFilters
            status={status}
            ownership={ownership}
            keyword={keyword}
            pending={pending}
            onNavigate={navigate}
          />
        </CardContent>
      </Card>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle>项目列表</CardTitle>
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
        </CardHeader>
        <CardContent className="relative p-0">
          <ProjectsTable projects={projects} />
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          每页 {pagination.pageSize} 条，共 {pagination.total} 条
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
    </>
  );
}
