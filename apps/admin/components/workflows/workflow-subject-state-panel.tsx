"use client";

import { useEffect, useState } from "react";
import { Loader2, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requestBackendJson } from "@/lib/backend-client";

type WorkflowSubjectType = "customer" | "project" | "expense_request" | "procedure";

type WorkflowSubjectState = {
  subject_type: WorkflowSubjectType;
  subject_id: string;
  instance_id: string | null;
  instance_status: string | null;
  current_node_key: string | null;
  current_node_title: string | null;
  current_business_kind: string | null;
  pending_task_count: number;
  actions: Array<{
    key: string;
    label: string;
    task_id: string;
    requires_reason: boolean;
    disabled: boolean;
  }>;
};

function statusLabel(status: string | null) {
  const labels: Record<string, string> = {
    running: "运行中",
    completed: "已完成",
    canceled: "已取消",
    failed: "异常",
  };
  return status ? labels[status] || status : "未启动";
}

export function WorkflowSubjectStatePanel({
  subjectId,
  subjectType,
}: {
  subjectId: string;
  subjectType: WorkflowSubjectType;
}) {
  const [state, setState] = useState<WorkflowSubjectState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    requestBackendJson<{ workflow_state: WorkflowSubjectState | null }>(
      `/workflow-subjects/${subjectType}/${subjectId}/state`,
      { cache: "no-store", fallbackMessage: "流程状态加载失败" },
    )
      .then((data) => {
        if (!cancelled) setState(data.workflow_state ?? null);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subjectId, subjectType]);

  return (
    <section className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Workflow className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Workflow 状态</span>
        </div>
        {loading ? (
          <Badge variant="secondary">
            <Loader2 className="animate-spin" data-icon="inline-start" />
            加载中
          </Badge>
        ) : (
          <Badge variant={state?.instance_status === "failed" ? "danger" : "outline"}>
            {statusLabel(state?.instance_status ?? null)}
          </Badge>
        )}
      </div>
      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <span className="text-foreground">当前节点：</span>
          {state?.current_node_title || state?.current_node_key || "-"}
        </div>
        <div>
          <span className="text-foreground">待办：</span>
          {state?.pending_task_count ?? 0}
        </div>
        <div>
          <span className="text-foreground">可见动作：</span>
          {state?.actions?.length ?? 0}
        </div>
      </div>
    </section>
  );
}
