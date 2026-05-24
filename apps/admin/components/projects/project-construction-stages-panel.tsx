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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestBackend<T>(path: string) {
  const response = await fetch(`/api/backend${path}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "请求失败"));
  }
  return payload.data as T;
}

function statusMeta(status: ConstructionStageStatus) {
  if (status === "accepted") {
    return { label: "已通过", variant: "success" as const, icon: CheckCircle2 };
  }
  if (status === "pending_acceptance") {
    return { label: "验收中", variant: "warning" as const, icon: Clock3 };
  }
  if (status === "rework_required") {
    return { label: "需整改", variant: "danger" as const, icon: AlertTriangle };
  }
  if (status === "in_progress") {
    return { label: "施工中", variant: "default" as const, icon: Wrench };
  }
  if (status === "locked") {
    return { label: "未解锁", variant: "outline" as const, icon: Lock };
  }
  return { label: "未开始", variant: "secondary" as const, icon: CircleDot };
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

function ConstructionStageSkeleton({ compact }: { compact: boolean }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent
        className={cn(
          "grid gap-3",
          compact ? "md:grid-cols-3" : "md:grid-cols-4",
        )}
      >
        {Array.from({ length: compact ? 3 : 7 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-md" />
        ))}
      </CardContent>
    </Card>
  );
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

  async function loadStages() {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const payload = await requestBackend<ConstructionStagesPayload>(
        `/projects/${projectId}/construction-stages`,
      );
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "施工阶段加载失败");
      setData(null);
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
  const currentLabel = data?.next_stage?.stage_label ||
    (data?.required_completed ? "施工阶段已完成" : "等待前置阶段");

  if (loading && !data) {
    return <ConstructionStageSkeleton compact={compact} />;
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>施工阶段</CardTitle>
            <CardDescription className="mt-2">
              当前：{currentLabel}
              {data?.required_completed
                ? " · 必需工序已完成"
                : data?.missing_required_stages?.length
                  ? ` · 待完成 ${data.missing_required_stages.length} 个工序`
                  : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.required_completed ? (
              <Badge variant="success">可进入竣工验收</Badge>
            ) : (
              <Badge variant="secondary">施工推进中</Badge>
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
        {error ? <StatusAlert>{error}</StatusAlert> : null}
      </CardHeader>
      <CardContent
        className={cn(
          "grid gap-3",
          compact ? "md:grid-cols-3" : "md:grid-cols-4",
        )}
      >
        {visibleStages.map((stage, index) => {
          const meta = statusMeta(stage.status);
          const Icon = meta.icon;
          return (
            <article
              key={stage.stage_code}
              className={cn(
                "flex min-h-28 flex-col gap-3 rounded-md border bg-background p-3",
                stage.stage_code === data?.current_stage && "border-primary",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {index + 1}. {stage.stage_label}
                    </div>
                    {stage.is_completion ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        项目级验收
                      </div>
                    ) : null}
                  </div>
                </div>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </div>
              {stage.blocked_reason ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {stage.blocked_reason}
                </p>
              ) : stage.latest_log ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  最近日志：{stage.latest_log.node_name || "施工更新"}
                  {formatDateTime(stage.latest_log.created_at)
                    ? ` · ${formatDateTime(stage.latest_log.created_at)}`
                    : ""}
                </p>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  {stage.can_create_log || stage.can_create_acceptance
                    ? "当前可推进"
                    : "暂无记录"}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-1.5">
                {stage.can_create_log ? <Badge variant="outline">可写日志</Badge> : null}
                {stage.can_create_acceptance ? <Badge variant="outline">可发起验收</Badge> : null}
              </div>
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}
