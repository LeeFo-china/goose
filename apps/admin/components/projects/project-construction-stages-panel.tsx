"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  Lock,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

type ConstructionStageStatus =
  | "locked"
  | "not_started"
  | "in_progress"
  | "pending_acceptance"
  | "rework_required"
  | "accepted"
  | string;

type ConstructionStageItem = {
  stage_code: string;
  stage_label: string;
  status: ConstructionStageStatus;
  is_required?: boolean;
  is_completion?: boolean;
  can_create_log?: boolean;
  can_create_acceptance?: boolean;
  acceptance_id: string | null;
  acceptance_status: string | null;
  latest_log: {
    id: string;
    node_name: string | null;
    content: string | null;
    created_at: string | null;
  } | null;
  blocked_reason: string | null;
};

type ConstructionStagesPayload = {
  project_id: string;
  project_status: string | null;
  required_completed: boolean;
  current_stage: string | null;
  next_stage: ConstructionStageItem | null;
  missing_required_stages: Array<{
    stage_code: string;
    stage_label: string;
  }>;
  stages: ConstructionStageItem[];
};

type WorkflowProgressGate = {
  type: "payment_collection";
  payment_type: string;
  payment_label: string;
  blocked_stage_code: string | null;
  blocked_stage_label: string | null;
};

type WorkflowProgressPayload = {
  source: "workflow_runtime" | "missing_runtime" | "unavailable";
  current_node_key: string | null;
  current_node_title: string | null;
  current_node_type: string | null;
  current_business_kind: string | null;
  current_stage_code: string | null;
  current_gate: WorkflowProgressGate | null;
};

type ProjectDetailBootstrapPayload = {
  workflow_progress?: WorkflowProgressPayload | null;
  construction_stages?: ConstructionStagesPayload | null;
};

async function requestBackend<T>(path: string) {
  return requestBackendJson<T>(path, {
    fallbackMessage: "请求失败",
  });
}

function statusMeta(status: ConstructionStageStatus) {
  if (status === "accepted") {
    return {
      label: "已通过",
      variant: "success" as const,
      icon: CheckCircle2,
      dotClass: "border-success bg-success text-success-foreground",
    };
  }
  if (status === "pending_acceptance") {
    return {
      label: "验收中",
      variant: "warning" as const,
      icon: Clock3,
      dotClass: "border-warning bg-warning text-warning-foreground",
    };
  }
  if (status === "rework_required") {
    return {
      label: "需整改",
      variant: "danger" as const,
      icon: AlertTriangle,
      dotClass: "border-destructive bg-destructive text-destructive-foreground",
    };
  }
  if (status === "in_progress") {
    return {
      label: "施工中",
      variant: "default" as const,
      icon: Wrench,
      dotClass: "border-primary bg-primary text-primary-foreground",
    };
  }
  if (status === "locked") {
    return {
      label: "未解锁",
      variant: "outline" as const,
      icon: Lock,
      dotClass: "border-border bg-muted text-muted-foreground",
    };
  }
  return {
    label: "未开始",
    variant: "secondary" as const,
    icon: CircleDot,
    dotClass: "border-border bg-background text-muted-foreground",
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function workflowProgressTitle(progress: WorkflowProgressPayload | null) {
  if (!progress) return "";
  if (progress.source === "missing_runtime") return "流程同步中";
  if (progress.source === "unavailable") return "流程进度加载失败";
  return progress.current_gate?.payment_label ||
    progress.current_node_title ||
    progress.current_node_key ||
    "";
}

function workflowProgressBadge(progress: WorkflowProgressPayload | null) {
  if (!progress) return null;
  if (progress.source === "missing_runtime") {
    return { label: "流程同步中", variant: "secondary" as const };
  }
  if (progress.source === "unavailable") {
    return { label: "流程不可用", variant: "warning" as const };
  }
  if (progress.current_gate?.type === "payment_collection") {
    return { label: "收款节点", variant: "warning" as const };
  }
  if (progress.current_node_type === "procedure") {
    return { label: "工序节点", variant: "default" as const };
  }
  return { label: "流程运行中", variant: "secondary" as const };
}

function ConstructionStageSkeleton({ compact }: { compact: boolean }) {
  return (
    <section className="rounded-md border bg-card p-4">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="mt-2 h-4 w-56" />
      <div className="mt-5 flex flex-col gap-4 lg:flex-row">
        {Array.from({ length: compact ? 3 : 7 }).map((_, index) => (
          <div key={index} className="flex min-w-0 flex-1 items-start gap-3 lg:block">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 lg:mt-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function stageFlowConnector(index: number, total: number) {
  return cn(
    "absolute bg-border",
    index < total - 1 &&
      "left-[15px] top-10 h-[calc(100%+0.75rem)] w-px lg:left-[calc(50%+1.25rem)] lg:top-4 lg:h-px lg:w-[calc(100%-2.5rem)]",
  );
}

function stageSummary(stage: ConstructionStageItem) {
  if (stage.blocked_reason) return stage.blocked_reason;
  if (stage.latest_log) {
    const dateTime = formatDateTime(stage.latest_log.created_at);
    return [
      `最近日志：${stage.latest_log.node_name || "施工更新"}`,
      dateTime,
    ].filter(Boolean).join(" · ");
  }
  if (stage.can_create_log || stage.can_create_acceptance) return "当前可推进";
  return "暂无记录";
}

export function ProjectConstructionStagesPanel({
  projectId,
  active = true,
  compact = false,
}: {
  projectId: string;
  active?: boolean;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ConstructionStagesPayload | null>(null);
  const [workflowProgress, setWorkflowProgress] =
    useState<WorkflowProgressPayload | null>(null);

  async function loadStages() {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const payload = await requestBackend<ProjectDetailBootstrapPayload>(
        `/projects/${projectId}/employee-detail-bootstrap?log_page_size=1&include_calendar=false&include_referral_summary=false&include_cameras_summary=false`,
      );
      setData(payload.construction_stages ?? null);
      setWorkflowProgress(payload.workflow_progress ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "施工阶段加载失败");
      setData(null);
      setWorkflowProgress(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void loadStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, projectId]);

  const stages = useMemo(() => data?.stages || [], [data?.stages]);
  const visibleStages = compact ? stages.slice(0, 6) : stages;
  const progressTitle = workflowProgressTitle(workflowProgress);
  const progressBadge = workflowProgressBadge(workflowProgress);
  const currentStageCode = workflowProgress?.source === "workflow_runtime"
    ? workflowProgress.current_stage_code
    : null;

  if (loading && !data) {
    return <ConstructionStageSkeleton compact={compact} />;
  }

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">施工阶段明细</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            当前节点以流程状态为准。
            {progressTitle ? ` 参考节点：${progressTitle}` : ""}
            {data?.required_completed
              ? " · 必需工序已完成"
              : data?.missing_required_stages?.length
                ? ` · 待完成 ${data.missing_required_stages.length} 个工序`
                : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {progressBadge ? (
            <Badge variant={progressBadge.variant}>{progressBadge.label}</Badge>
          ) : (
            <Badge variant="secondary">阶段明细</Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={loadStages}
            disabled={loading}
            aria-label="刷新施工阶段"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      {error ? <div className="mt-3"><StatusAlert>{error}</StatusAlert></div> : null}

      {visibleStages.length > 0 ? (
        <ol
          data-testid="project-construction-stage-flow"
          className="mt-5 flex flex-col gap-4 lg:flex-row lg:gap-5"
        >
          {visibleStages.map((stage, index) => {
            const meta = statusMeta(stage.status);
            const Icon = meta.icon;
            const current = stage.stage_code === currentStageCode;

            return (
              <li
                key={stage.stage_code}
                className="relative flex min-w-0 flex-1 gap-3 lg:flex-col lg:items-center lg:gap-2"
              >
                <span aria-hidden="true" className={stageFlowConnector(index, visibleStages.length)} />
                <div className="relative z-10 flex shrink-0 flex-col items-center">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border shadow-sm",
                      meta.dotClass,
                      current && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                </div>
                <article
                  className={cn(
                    "min-w-0 flex-1 border-b pb-3 lg:w-full lg:border-b-0 lg:pb-0 lg:text-center",
                    current && "text-foreground",
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2 lg:block">
                    <div className="min-w-0 lg:flex lg:flex-col lg:items-center">
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <h4 className="mt-0.5 text-sm font-semibold leading-5">
                        {stage.stage_label}
                      </h4>
                    </div>
                    <Badge
                      variant={meta.variant}
                      className="shrink-0 lg:mt-2"
                    >
                      {meta.label}
                    </Badge>
                  </div>
                  {stage.is_completion ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      项目级验收
                    </div>
                  ) : null}
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {stageSummary(stage)}
                  </p>
                  {(stage.can_create_log || stage.can_create_acceptance) ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {stage.can_create_log ? <Badge variant="outline">可写日志</Badge> : null}
                      {stage.can_create_acceptance ? <Badge variant="outline">可发起验收</Badge> : null}
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-4 rounded-md border border-dashed px-3 py-5 text-sm text-muted-foreground">
          暂无施工阶段明细。
        </div>
      )}
    </section>
  );
}
