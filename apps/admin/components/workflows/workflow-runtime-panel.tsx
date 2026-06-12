"use client";

import { useEffect, useState, useTransition } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
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
import { fetchWorkflowRuntimeInstances } from "./workflow-requests";
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

const subjectLabels: Record<WorkflowRuntimeInstance["subject_type"], string> = {
  manual: "手动",
  customer: "客户",
  project: "项目",
  expense_request: "费用",
  procedure: "工序",
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
  className,
}: {
  workflowId: string;
  className?: string;
}) {
  const [data, setData] = useState<WorkflowRuntimeInstanceListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadInstances() {
    startTransition(async () => {
      try {
        setError(null);
        const result = await fetchWorkflowRuntimeInstances(workflowId, {
          page: 1,
          pageSize: 5,
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
  }, [workflowId]);

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
              最近 5 条已发布流程运行记录。
            </p>
          </div>
        </div>
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
              <TableHead>当前节点</TableHead>
              <TableHead>开始时间</TableHead>
              <TableHead>完成时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.length > 0 ? (
              instances.map((instance) => (
                <TableRow key={instance.id}>
                  <TableCell>
                    <div className="font-medium">
                      {subjectLabels[instance.subject_type]}
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
                    {instance.current_node_key || "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(instance.started_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(instance.completed_at)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
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
        共 {data?.pagination.total ?? 0} 条，仅展示最近 5 条。
      </div>
    </section>
  );
}
