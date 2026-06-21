"use client";

import { ArrowRight, CircleDot, ClipboardCheck, FileText, History, UserRound, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProjectStatusActionItem } from "@/components/projects/project-mutation-types";
import { formatDateTime } from "@/components/projects/project-mutation-utils";
import type { WorkflowSubjectAction, WorkflowSubjectState, WorkflowSubjectTimelineItem, WorkflowSubjectTimelineNode } from "@/components/workflows/workflow-subject-state-panel";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

const instanceStatusLabels: Record<string, string> = {
  running: "运行中",
  completed: "已完成",
  canceled: "已取消",
  failed: "异常",
};

const instanceStatusVariants: Record<string, BadgeVariant> = {
  running: "default",
  completed: "success",
  canceled: "outline",
  failed: "danger",
};

const nodeStatusVariants: Record<string, BadgeVariant> = {
  current: "default",
  running: "default",
  done: "success",
  completed: "success",
  blocked: "danger",
  failed: "danger",
  pending: "secondary",
  waiting: "secondary",
};

const attributeLabels: Record<string, string> = {
  acceptance_enabled: "阶段验收",
  acceptance_id: "验收单",
  acceptance_required: "验收闭环",
  acceptance_status: "验收状态",
  assignee_employee_name: "负责人",
  finance_confirmed_at: "确认时间",
  finance_confirmed_by_employee_name: "收款确认人",
  finance_reviewer_employee_name: "财务确认人",
  min_image_count: "最少照片",
  payment_type: "收款类型",
  require_log: "施工日志",
  stage_code: "工序",
};

const hiddenAttributeKeys = new Set([
  "acceptance_id", "assignee_employee_id", "finance_confirmed_by_employee_id", "finance_reviewer_employee_id",
]);

export function WorkflowRuntimeSummary({ actionCount, executableActionCount, state }: {
  actionCount: number;
  executableActionCount: number;
  state: WorkflowSubjectState;
}) {
  return (
    <section className="grid gap-3 text-sm md:grid-cols-4">
      <SummaryItem label="运行状态" value={instanceStatusLabel(state.instance_status)} badgeVariant={instanceStatusVariant(state.instance_status)} />
      <SummaryItem label="当前节点" value={state.current_node_title || state.current_node_key || "-"} />
      <SummaryItem label="待办" value={`${state.pending_task_count ?? 0} 个`} />
      <SummaryItem label="动作" value={`${executableActionCount}/${actionCount} 可执行`} />
      <div className="md:col-span-4">
        <div className="text-xs text-muted-foreground">实例</div>
        <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {state.instance_id || "未启动"}
        </div>
      </div>
    </section>
  );
}

function SummaryItem({ badgeVariant, label, value }: {
  badgeVariant?: BadgeVariant;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 truncate font-medium">
        {badgeVariant ? <Badge variant={badgeVariant}>{value}</Badge> : value}
      </div>
    </div>
  );
}

export function WorkflowTimeline({ nodes }: { nodes: WorkflowSubjectTimelineNode[] }) {
  if (nodes.length === 0) {
    return (
      <section className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
        后端未返回完整 timeline_nodes，仅能展示当前节点摘要。
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CircleDot className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">节点序列</h3>
      </div>
      <ol className="relative ml-3 border-l">
        {nodes.map((node, index) => {
          const attributes = timelineNodeAttributes(node);
          const active = node.status === "current" || node.status === "running";
          return (
            <li key={`${node.node_key}-${index}`} className="pb-4 pl-5 last:pb-0">
              <span className={cn("absolute -left-[7px] mt-3 flex size-3 items-center justify-center rounded-full border bg-background", active ? "border-primary" : "border-border")}>
                {active ? <span className="size-1.5 rounded-full bg-primary" /> : null}
              </span>
              <article className={cn("rounded-md border bg-background px-3 py-3", active ? "border-primary/50 bg-primary/5" : "")}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="truncate text-sm font-semibold">{timelineNodeTitle(node)}</div>
                    </div>
                    <div className="mt-1 break-all text-xs text-muted-foreground">{node.node_key}</div>
                  </div>
                  <Badge variant={nodeStatusVariant(node)}>{nodeStatusLabel(node)}</Badge>
                </div>
                <NodeCapabilityLine node={node} />
                {attributes.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {attributes.map((item) => (
                      <Badge key={item.key} variant="outline">{item.label}: {item.value}</Badge>
                    ))}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function NodeCapabilityLine({ node }: { node: WorkflowSubjectTimelineNode }) {
  const insight = buildNodeInsight(node);
  if (!insight) return null;

  const Icon = node.business_kind === "payment_collection"
    ? WalletCards
    : node.node_type === "procedure" || Boolean(node.attributes?.stage_code)
      ? ClipboardCheck
      : node.assignee_employee_name || node.attributes?.assignee_employee_name
        ? UserRound
        : FileText;

  return (
    <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span>{insight}</span>
    </div>
  );
}

export function WorkflowTransitionList({ transitions }: {
  transitions: WorkflowSubjectTimelineItem[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">最近流转</h3>
      </div>
      {transitions.length > 0 ? (
        <div className="divide-y rounded-md border bg-background">
          {transitions.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{item.action || "complete"}</span>
                <Badge variant="outline">{item.source_node_key || "开始"}</Badge>
                <ArrowRight className="size-4 text-muted-foreground" />
                <Badge variant="outline">{item.target_node_key || "结束"}</Badge>
              </div>
              <time dateTime={item.created_at} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatDateTime(item.created_at)}
              </time>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
          暂无状态流转记录。
        </div>
      )}
    </section>
  );
}

export function findCurrentNode(nodes: WorkflowSubjectTimelineNode[], currentNodeKey: string | null | undefined) {
  return nodes.find((node) => node.status === "current" || node.status === "running") ||
    nodes.find((node) => node.node_key === currentNodeKey) ||
    null;
}

export function timelineNodeTitle(node: WorkflowSubjectTimelineNode) {
  return node.display?.label || node.node_title || node.title || node.node_key || "-";
}

export function nodeStatusLabel(node: WorkflowSubjectTimelineNode) {
  return node.display?.status_label || node.status || "待处理";
}

export function nodeStatusVariant(node: WorkflowSubjectTimelineNode): BadgeVariant {
  const displayVariant = normalizeBadgeVariant(node.display?.status_variant);
  if (displayVariant) return displayVariant;
  return nodeStatusVariants[node.status || ""] || "outline";
}

function instanceStatusLabel(status: string | null | undefined) {
  return status ? instanceStatusLabels[status] || status : "未启动";
}

function instanceStatusVariant(status: string | null | undefined): BadgeVariant {
  return status ? instanceStatusVariants[status] || "outline" : "outline";
}

function normalizeBadgeVariant(value: unknown): BadgeVariant | null {
  if (
    value === "default" ||
    value === "secondary" ||
    value === "outline" ||
    value === "success" ||
    value === "warning" ||
    value === "danger"
  ) {
    return value;
  }
  return null;
}

function formatAttributeValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) {
    return value.map((item) => formatAttributeValue(key, item)).filter(Boolean).join("、");
  }
  if (typeof value === "object") return "";
  if (key.endsWith("_at")) return formatDateTime(String(value));
  return String(value);
}

export function timelineNodeAttributes(node: WorkflowSubjectTimelineNode) {
  return Object.entries(node.attributes || {})
    .filter(([key]) => !hiddenAttributeKeys.has(key))
    .map(([key, value]) => ({
      key,
      label: attributeLabels[key] || key,
      value: formatAttributeValue(key, value),
    }))
    .filter((item) => item.value);
}

export function buildNodeInsight(node: WorkflowSubjectTimelineNode) {
  const attributes = node.attributes || {};
  const assigneeName = readString(node.assignee_employee_name) ||
    readString(attributes.assignee_employee_name);

  if (node.business_kind === "payment_collection" || attributes.payment_type) {
    const confirmedBy = readString(attributes.finance_confirmed_by_employee_name);
    if (confirmedBy) return `已由 ${confirmedBy} 确认收款`;

    const reviewerName = readString(attributes.finance_reviewer_employee_name);
    if (reviewerName) return `等待 ${reviewerName} 确认收款`;

    return "等待财务人员确认";
  }

  if (node.node_type === "procedure" || attributes.stage_code) {
    const parts: string[] = [];
    if (attributes.require_log === true) {
      const minImageCount = typeof attributes.min_image_count === "number"
        ? attributes.min_image_count
        : null;
      parts.push(minImageCount ? `需要施工日志，至少 ${minImageCount} 张照片` : "需要施工日志");
    }
    if (attributes.acceptance_enabled === true) {
      const acceptanceStatus = readString(attributes.acceptance_status);
      parts.push(acceptanceStatus ? `阶段验收已开启，当前 ${acceptanceStatus}` : "阶段验收已开启");
    } else if (attributes.acceptance_enabled === false) {
      parts.push("阶段验收未开启");
    }
    if (assigneeName) parts.push(`负责人 ${assigneeName}`);
    return parts.join("；");
  }

  if (assigneeName) return `负责人 ${assigneeName}`;
  return "";
}

export function dedupeActions(actions: WorkflowSubjectAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.task_id || ""}:${action.key || ""}:${action.node_key || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getActionDisabledReason(action: WorkflowSubjectAction) {
  if (action.disabled) return action.disabled_reason || "当前动作不可执行";
  if (!action.task_id) return "当前动作没有可执行待办";

  const requiredFields = (action.output_fields || []).filter((field) => field.required);
  if (requiredFields.length === 0) return "";

  const fieldTypes = requiredFields.map((field) => field.type).join(",");
  if (fieldTypes.includes("project_log")) return "请在施工日志入口处理";
  if (fieldTypes.includes("acceptance")) return "请在工序验收入口处理";
  if (fieldTypes.includes("project_payment")) return "请在财务收款待办处理";
  return "该动作需要业务表单输入";
}

export function mapWorkflowAction(
  action: WorkflowSubjectAction,
  currentStatus: string | null | undefined,
): ProjectStatusActionItem {
  return {
    action: action.key || action.task_id || "complete",
    label: action.label || action.key || "执行动作",
    from_status: currentStatus || "-",
    to_status: action.node_key || action.node_type || "-",
    requires_reason: action.requires_reason,
    workflow_action_key: action.key,
    workflow_task_id: action.task_id,
    workflow_business_domain: action.business_domain,
    workflow_node_key: action.node_key,
    workflow_node_type: action.node_type,
    workflow_output_fields: action.output_fields,
  };
}

export function buildActionOutput(action: ProjectStatusActionItem) {
  if (action.workflow_business_domain === "payment_collection") {
    return { payment_status: "success" };
  }
  return {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
