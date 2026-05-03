"use client";

import { useEffect, useMemo, useState } from "react";
import { PROJECT_LOG_STAGE_CONFIG, isProjectLogStageCode } from "@gooes/domain";
import { CalendarDays, FileText, ImageIcon, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectRecord } from "@/components/projects/project-mutations";

type ProjectLogRecord = {
  id: string;
  project_id: string;
  employee_id: string | null;
  stage_code: string | null;
  stage_label?: string | null;
  node_name: string | null;
  content: string;
  images: string[];
  created_at: string | null;
  employee?: {
    id?: string | null;
    name?: string | null;
    avatar?: string | null;
  } | null;
};

type ProjectLogCalendarItem = {
  date: string;
  count: number;
  stage_code: string | null;
  stage_label: string | null;
  node_name: string | null;
};

type ProjectLogsData = {
  list: ProjectLogRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ProjectLogCalendarData = {
  project_id: string;
  list: ProjectLogCalendarItem[];
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function stageLabel(log: ProjectLogRecord) {
  if (log.stage_label) return log.stage_label;
  return isProjectLogStageCode(log.stage_code)
    ? PROJECT_LOG_STAGE_CONFIG[log.stage_code].label
    : log.stage_code || "未标记阶段";
}

function employeeName(log: ProjectLogRecord) {
  return log.employee?.name || "未命名员工";
}

function buildSummary(logs: ProjectLogRecord[], calendar: ProjectLogCalendarItem[]) {
  const imageLogCount = logs.filter((log) => log.images.length > 0).length;
  const latest = logs[0] || null;
  const latestCalendar = calendar[0] || null;
  const monthCount = calendar.reduce((sum, item) => sum + Number(item.count || 0), 0);

  return {
    latestTime: latest?.created_at || null,
    latestStage: latest ? stageLabel(latest) : latestCalendar?.stage_label || "-",
    monthCount,
    imageLogCount,
  };
}

function ProjectLogSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-md border p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function ProjectLogsPanel({
  project,
  active = true,
}: {
  project: ProjectRecord;
  active?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<ProjectLogRecord[]>([]);
  const [calendar, setCalendar] = useState<ProjectLogCalendarItem[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      requestBackend<ProjectLogsData>(
        `/project_logs/projects?project_id=${project.id}&page=1&pageSize=10`,
      ),
      requestBackend<ProjectLogCalendarData>(
        `/project_logs/projects/calendar?project_id=${project.id}`,
      ),
    ])
      .then(([logData, calendarData]) => {
        if (cancelled) return;
        setLogs(logData.list || []);
        setTotal(logData.pagination?.total || 0);
        setCalendar(calendarData.list || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "施工日志加载失败");
          setLogs([]);
          setTotal(0);
          setCalendar([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, project.id]);

  const summary = useMemo(() => buildSummary(logs, calendar), [calendar, logs]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">施工日志</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.name} · 最近 10 条施工记录
          </p>
        </div>
        <Badge variant="outline">共 {total} 条</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">最近日志</div>
            <div className="mt-1 truncate text-sm font-medium">
              {formatDateTime(summary.latestTime)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">当前阶段</div>
            <div className="mt-1 truncate text-sm font-medium">{summary.latestStage}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">日历记录</div>
            <div className="mt-1 text-sm font-medium">{summary.monthCount} 条</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">有图日志</div>
            <div className="mt-1 text-sm font-medium">{summary.imageLogCount} 条</div>
          </CardContent>
        </Card>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      {loading ? (
        <ProjectLogSkeleton />
      ) : logs.length > 0 ? (
        <div className="relative flex flex-col gap-4 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-border">
          {logs.map((log) => (
            <article key={log.id} className="relative pl-8">
              <span className="absolute left-0 top-1 flex size-6 items-center justify-center rounded-full border bg-background">
                <FileText className="size-3.5 text-muted-foreground" />
              </span>
              <div className="rounded-md border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{stageLabel(log)}</Badge>
                  {log.node_name ? <Badge variant="outline">{log.node_name}</Badge> : null}
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3" />
                    {formatDateTime(log.created_at)}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{log.content}</p>
                {log.images.length > 0 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {log.images.slice(0, 6).map((image) => (
                      <a
                        key={image}
                        href={image}
                        target="_blank"
                        rel="noreferrer"
                        className="block size-20 shrink-0 overflow-hidden rounded-md border bg-muted"
                      >
                        <img src={image} alt="施工日志图片" className="size-full object-cover" />
                      </a>
                    ))}
                    {log.images.length > 6 ? (
                      <div className="flex size-20 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                        +{log.images.length - 6}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{employeeName(log)}</span>
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="size-3" />
                    {log.images.length} 张图片
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          暂无施工日志
        </div>
      )}

      {total > logs.length ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" disabled>
            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            暂仅展示最近 10 条
          </Button>
        </div>
      ) : null}
    </div>
  );
}
