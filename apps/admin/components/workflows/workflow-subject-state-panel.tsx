"use client";

import { useEffect, useState } from "react";
import { Loader2, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requestBackendJson } from "@/lib/backend-client";

type WorkflowSubjectType = "customer" | "project" | "expense_request" | "procedure";

export type WorkflowSubjectAction = {
  key: string;
  label: string;
  task_id: string;
  node_key: string;
  node_type: string;
  business_domain:
    | "customer_status"
    | "workflow_project"
    | "payment_collection"
    | "expense_request"
    | null;
  business_action: string | null;
  requires_reason: boolean;
  disabled: boolean;
  output_fields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    stage_code?: string;
    min_image_count?: number;
    payment_type?: string;
    payment_label?: string;
    requirement_mode?: string;
    required_percentage?: number;
    min_amount?: number;
  }>;
};

export type WorkflowSubjectTimelineNode = {
  node_key: string;
  node_title?: string | null;
  title?: string | null;
  status?: string | null;
  display?: {
    status_label?: string | null;
    [key: string]: unknown;
  } | null;
  attributes?: Record<string, unknown> | null;
};

export type WorkflowSubjectState = {
  subject_type: WorkflowSubjectType;
  subject_id: string;
  instance_id: string | null;
  instance_status: string | null;
  current_node_key: string | null;
  current_node_title: string | null;
  current_business_kind: string | null;
  pending_task_count: number;
  actions: WorkflowSubjectAction[];
  timeline_nodes?: WorkflowSubjectTimelineNode[];
};

export type WorkflowSubjectTimelineItem = {
  id: string;
  source_node_key: string | null;
  target_node_key: string | null;
  action: string;
  context: Record<string, unknown>;
  actor_employee_id: string | null;
  created_at: string;
};

export type WorkflowSubjectTimelineResponse = {
  list: WorkflowSubjectTimelineItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
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

function timelineNodeTitle(node: WorkflowSubjectTimelineNode) {
  return node.node_title || node.title || node.node_key || "-";
}

function timelineNodeStatusLabel(node: WorkflowSubjectTimelineNode) {
  return node.display?.status_label || node.status || "待处理";
}

function timelineNodeStatusVariant(node: WorkflowSubjectTimelineNode) {
  const status = node.status || "";
  if (status === "current" || status === "running") return "default" as const;
  if (status === "done" || status === "completed") return "success" as const;
  if (status === "blocked" || status === "failed") return "danger" as const;
  if (status === "pending" || status === "waiting") return "secondary" as const;
  return "outline" as const;
}

function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) {
    return value
      .map(formatAttributeValue)
      .filter(Boolean)
      .join("、");
  }
  if (typeof value === "object") return "";
  return String(value);
}

function timelineNodeAttributes(node: WorkflowSubjectTimelineNode) {
  return Object.entries(node.attributes || {})
    .map(([key, value]) => ({ key, value: formatAttributeValue(value) }))
    .filter((item) => item.value);
}

export function WorkflowSubjectStatePanel({
  onStateChange,
  subjectId,
  subjectType,
}: {
  onStateChange?: (state: WorkflowSubjectState | null) => void;
  subjectId: string;
  subjectType: WorkflowSubjectType;
}) {
  const [state, setState] = useState<WorkflowSubjectState | null>(null);
  const [loading, setLoading] = useState(false);
  const timelineNodes = state?.timeline_nodes || [];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    requestBackendJson<{ workflow_state: WorkflowSubjectState | null }>(
      `/workflow-subjects/${subjectType}/${subjectId}/state`,
      { cache: "no-store", fallbackMessage: "流程状态加载失败" },
    )
      .then((data) => {
        if (cancelled) return;
        const nextState = data.workflow_state ?? null;
        setState(nextState);
        onStateChange?.(nextState);
      })
      .catch(() => {
        if (cancelled) return;
        setState(null);
        onStateChange?.(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onStateChange, subjectId, subjectType]);

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
      {timelineNodes.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {timelineNodes.map((node, index) => {
            const attributes = timelineNodeAttributes(node);
            return (
              <article
                key={`${node.node_key}-${index}`}
                className="rounded-md border bg-background px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {index + 1}. {timelineNodeTitle(node)}
                    </div>
                    <div className="mt-0.5 break-all text-xs text-muted-foreground">
                      {node.node_key}
                    </div>
                  </div>
                  <Badge variant={timelineNodeStatusVariant(node)}>
                    {timelineNodeStatusLabel(node)}
                  </Badge>
                </div>
                {attributes.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attributes.map((item) => (
                      <Badge key={item.key} variant="outline">
                        {item.key}: {item.value}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-md border bg-background p-3 text-xs text-muted-foreground">
          后端未返回完整 workflow 节点序列，仅展示当前节点摘要。
        </div>
      )}
    </section>
  );
}
