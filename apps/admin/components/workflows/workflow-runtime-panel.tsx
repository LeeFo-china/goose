"use client";

import { useEffect, useState, useTransition } from "react";
import { Activity, Archive, Loader2, RefreshCw } from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { StatusAlert } from "@/components/admin/status-alert";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  archiveWorkflowRuntimeInstance,
  fetchWorkflowRuntimeInstances,
} from "./workflow-requests";
import {
  workflowRuntimeNodeTitle,
  workflowSubjectTypeLabel,
} from "./workflow-display-labels";
import {
  getWorkflowRuntimeVersionState,
  WORKFLOW_VERSION_EFFECT_COPY,
} from "./workflow-version-semantics";
import type {
  WorkflowRuntimeInstance,
  WorkflowRuntimeInstanceListData,
} from "./workflow-types";

const statusLabels: Record<WorkflowRuntimeInstance["status"], string> = {
  running: "运行中",
  completed: "已完成",
  canceled: "已取消",
  failed: "异常",
};

const statusVariants: Record<
  WorkflowRuntimeInstance["status"],
  "default" | "secondary" | "outline" | "danger"
> = {
  running: "default",
  completed: "secondary",
  canceled: "outline",
  failed: "danger",
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

export function WorkflowRuntimePanel({
  workflowId,
  activeVersionId,
  className,
}: {
  workflowId: string;
  activeVersionId?: string | null;
  className?: string;
}) {
  const [data, setData] = useState<WorkflowRuntimeInstanceListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<WorkflowRuntimeInstance | null>(null);
  const [pending, startTransition] = useTransition();

  function loadInstances() {
    startTransition(async () => {
      try {
        setError(null);
        const result = await fetchWorkflowRuntimeInstances(workflowId, {
          page: 1,
          pageSize: 5,
          archived: showArchived ? "all" : "without",
        });
        setData(result);
      } catch (loadError) {
        setError(loadError instanceof Error
          ? loadError.message
          : "流程运行实例加载失败");
      }
    });
  }

  useEffect(() => {
    loadInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, showArchived]);

  function confirmArchiveInstance() {
    if (!archiveTarget) return;
    startTransition(async () => {
      try {
        setError(null);
        await archiveWorkflowRuntimeInstance(workflowId, archiveTarget.id, {
          reason: "Admin 手动归档",
        });
        const result = await fetchWorkflowRuntimeInstances(workflowId, {
          page: 1,
          pageSize: 5,
          archived: showArchived ? "all" : "without",
        });
        setData(result);
        setArchiveTarget(null);
      } catch (archiveError) {
        setError(archiveError instanceof Error
          ? archiveError.message
          : "流程实例归档失败");
      }
    });
  }

  const instances = data?.list ?? [];

  return (
    <section className={cn(
      "flex min-h-0 flex-col overflow-hidden rounded-md border bg-background shadow-sm",
      className,
    )}>
      <div className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-md border bg-background">
            <Activity className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-normal">运行实例</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {WORKFLOW_VERSION_EFFECT_COPY.runtimeDescription}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setShowArchived((current) => !current)}
          >
            {showArchived ? "隐藏归档" : "含归档"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={loadInstances}
          >
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            刷新
          </Button>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 p-4">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>对象</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>实例版本</TableHead>
              <TableHead>当前节点</TableHead>
              <TableHead>开始时间</TableHead>
              <TableHead>完成时间</TableHead>
              <TableHead>归档</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.length > 0 ? (
              instances.map((instance) => {
                const versionState = getWorkflowRuntimeVersionState({
                  activeVersionId,
                  instanceVersionId: instance.version_id,
                  status: instance.status,
                });
                return (
                  <TableRow key={instance.id}>
                    <TableCell>
                      <div className="font-medium">
                        {workflowSubjectTypeLabel(instance.subject_type)}
                      </div>
                      <div className="max-w-[240px] truncate text-xs text-muted-foreground">
                        {instance.subject_id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[instance.status]}>
                        {statusLabels[instance.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={versionState.variant} className="w-fit">
                          {versionState.label}
                        </Badge>
                        {versionState.stale ? (
                          <span className="text-xs text-muted-foreground">
                            需受控重建后使用最新模板
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {workflowRuntimeNodeTitle({
                        nodeKey: instance.current_node_key,
                        nodeSnapshot: instance.current_node_snapshot,
                      })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(instance.started_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(instance.completed_at)}
                    </TableCell>
                    <TableCell>
                      {instance.archived_at ? (
                        <Badge variant="outline">已归档</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending ||
                          instance.status !== "completed" ||
                          Boolean(instance.archived_at)}
                        onClick={() => setArchiveTarget(instance)}
                      >
                        <Archive data-icon="inline-start" />
                        {instance.archived_at ? "已归档" : "归档实例"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  暂无运行实例
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="shrink-0 border-t bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
        共 {data?.pagination.total ?? 0} 条，仅展示最近 5 条，已归档实例默认隐藏。
      </div>
      <ConfirmActionDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setArchiveTarget(null);
        }}
        title="归档流程实例"
        description="归档只会从默认运行实例列表隐藏该已完成实例，不会删除流程审计、节点日志或业务关联记录。"
        confirmLabel="确认归档"
        pending={pending}
        onConfirm={confirmArchiveInstance}
      />
    </section>
  );
}
