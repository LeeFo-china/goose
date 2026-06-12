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
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <WorkflowFilters
            status={status}
            category={category}
            keyword={keyword}
            pending={pending}
            onNavigate={navigate}
            onCreated={(workflow) => refreshList(`/workflows/${workflow.id}`)}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <WorkflowTable workflows={workflows} />
          </div>
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新流程列表
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
                当前显示 {workflows.length} 条，共 {pagination.total} 条
              </span>
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
    </div>
  );
}
