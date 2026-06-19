"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchWorkflowVersions } from "./workflow-requests";
import { WORKFLOW_VERSION_EFFECT_COPY } from "./workflow-version-semantics";
import type {
  WorkflowVersionListData,
  WorkflowVersionSummary,
} from "./workflow-types";

const PAGE_SIZE = 20;

const versionStatusLabels: Record<WorkflowVersionSummary["status"], string> = {
  published: "已发布",
  deprecated: "已废弃",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkflowVersionListPanel({
  workflowId,
  activeVersionId,
  className,
}: {
  workflowId: string;
  activeVersionId?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WorkflowVersionListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadVersions(nextPage = page) {
    startTransition(async () => {
      try {
        setError(null);
        const result = await fetchWorkflowVersions(workflowId, {
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        setPage(nextPage);
        setData(result);
      } catch (loadError) {
        setError(loadError instanceof Error
          ? loadError.message
          : "流程版本列表加载失败");
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && !data && !pending) {
      loadVersions(1);
    }
  }

  useEffect(() => {
    setOpen(false);
    setPage(1);
    setData(null);
    setError(null);
  }, [workflowId]);

  const versions = data?.list ?? [];
  const totalPages = data?.pagination.totalPages ?? 0;
  const hasPreviousPage = page > 1;
  const hasNextPage = totalPages > 0 && page < totalPages;

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={cn(
        "rounded-md border bg-background shadow-sm",
        className,
      )}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/30"
        >
          <span className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
              <History className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold tracking-normal">
                {WORKFLOW_VERSION_EFFECT_COPY.versionPanelTitle}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {WORKFLOW_VERSION_EFFECT_COPY.versionPanelDescription}
              </span>
            </span>
          </span>
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="text-sm text-muted-foreground">
              共 {data?.pagination.total ?? 0} 个发布版本
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => loadVersions(page)}
            >
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              刷新
            </Button>
          </div>

          {error ? (
            <div className="px-4 pb-4">
              <StatusAlert>{error}</StatusAlert>
            </div>
          ) : null}

          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>版本</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>运行中实例</TableHead>
                  <TableHead>发布时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.length > 0 ? (
                  versions.map((version) => {
                    const isActive = version.is_active || version.id === activeVersionId;
                    return (
                      <TableRow key={version.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="font-medium">
                              v{version.version_number}
                            </div>
                            <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                              {version.id}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={isActive ? "success" : "outline"}>
                              {isActive ? "active" : "历史版本"}
                            </Badge>
                            <Badge variant="secondary">
                              {versionStatusLabels[version.status] || version.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={version.running_instance_count > 0
                              ? "warning"
                              : "outline"}
                          >
                            {version.running_instance_count} 个
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(version.published_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      暂无发布版本
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              第 {totalPages > 0 ? page : 0} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasPreviousPage || pending}
                onClick={() => loadVersions(page - 1)}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNextPage || pending}
                onClick={() => loadVersions(page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
