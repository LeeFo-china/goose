"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  WorkflowFilters,
  WorkflowPagination,
} from "@/components/workflows/workflow-list-actions";
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

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  function refreshList(href?: string) {
    startTransition(() => {
      if (href) router.push(href);
      router.refresh();
    });
  }

  return (
    <>
      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3">
          <WorkflowFilters
            status={status}
            category={category}
            keyword={keyword}
            pending={pending}
            onNavigate={navigate}
            onCreated={(workflow) => refreshList(`/workflows/${workflow.id}`)}
          />
        </CardHeader>
        <CardContent className="relative flex flex-col gap-4 p-0">
          <WorkflowTable workflows={workflows} />
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新流程列表
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
            <WorkflowPagination
              pagination={pagination}
              status={status}
              category={category}
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
