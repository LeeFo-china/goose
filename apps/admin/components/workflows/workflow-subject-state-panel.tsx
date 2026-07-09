"use client";

import { useEffect, useState } from "react";
import { Loader2, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  workflowAttributeLabel,
  workflowAttributeValue,
  workflowInstanceStatusLabel,
  workflowNodeStatusLabel,
  workflowNodeTitle,
} from "@/components/workflows/workflow-display-labels";
import { requestBackendJson } from "@/lib/backend-client";

type WorkflowSubjectType = "customer" | "project" | "expense_request" | "procedure";

export type WorkflowSubjectAction = {
  key: string;
  label: string;
  task_id?: string;
  node_key: string;
  node_type: string;
  business_domain:
    | "customer_status"
    | "workflow_project"
    | "project_acceptance"
    | "payment_collection"
    | "project_procedure"
    | "expense_request"
    | null;
  business_action: string | null;
  requires_reason: boolean;
  disabled: boolean;
  stage_code?: string | null;
  acceptance_id?: string | null;
  acceptance_status?: string | null;
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
    source?: string;
    default_value?: string | number | boolean | null;
    min?: number;
    max?: number;
  }>;
  disabled_reason?: string | null;
};

export type WorkflowSubjectTimelineNode = {
  node_key: string;
  node_title?: string | null;
  title?: string | null;
  node_type?: string | null;
  business_kind?: string | null;
  status?: string | null;
  display?: {
    label?: string | null;
    status_label?: string | null;
    status_variant?: string | null;
    [key: string]: unknown;
  } | null;
  attributes?: Record<string, unknown> | null;
  actions?: WorkflowSubjectAction[];
  assignee_employee_id?: string | null;
  assignee_employee_name?: string | null;
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

function timelineNodeTitle(node: WorkflowSubjectTimelineNode) {
  return workflowNodeTitle({
    displayLabel: node.display?.label,
    nodeKey: node.node_key,
    nodeTitle: node.node_title,
    title: node.title,
  });
}

function timelineNodeStatusLabel(node: WorkflowSubjectTimelineNode) {
  return workflowNodeStatusLabel(node.status, node.display?.status_label);
}

function timelineNodeStatusVariant(node: WorkflowSubjectTimelineNode) {
  const status = node.status || "";
  if (status === "current" || status === "running") return "default" as const;
  if (status === "done" || status === "completed") return "success" as const;
  if (status === "blocked" || status === "failed") return "danger" as const;
  if (status === "pending" || status === "waiting") return "secondary" as const;
  return "outline" as const;
}

function timelineNodeAttributes(node: WorkflowSubjectTimelineNode) {
  return Object.entries(node.attributes || {})
    .map(([key, value], index) => ({
      key,
      label: workflowAttributeLabel(key, index),
      value: workflowAttributeValue(value),
    }))
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
          <span className="text-sm font-semibold">流程状态</span>
        </div>
        {loading ? (
          <Badge variant="secondary">
            <Loader2 className="animate-spin" data-icon="inline-start" />
            加载中
          </Badge>
        ) : (
          <Badge variant={state?.instance_status === "failed" ? "danger" : "outline"}>
            {workflowInstanceStatusLabel(state?.instance_status ?? null)}
          </Badge>
        )}
      </div>
      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <span className="text-foreground">当前节点：</span>
          {workflowNodeTitle({
            fallback: "-",
            nodeKey: state?.current_node_key,
            nodeTitle: state?.current_node_title,
          })}
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
                  </div>
                  <Badge variant={timelineNodeStatusVariant(node)}>
                    {timelineNodeStatusLabel(node)}
                  </Badge>
                </div>
                {attributes.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attributes.map((item) => (
                      <Badge key={item.key} variant="outline">
                        {item.label}: {item.value}
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
          后端未返回完整流程节点序列，仅展示当前节点摘要。
        </div>
      )}
    </section>
  );
}
