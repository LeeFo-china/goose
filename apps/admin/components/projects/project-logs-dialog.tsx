"use client";

import { useEffect, useState } from "react";
import { PROJECT_LOG_STAGE_CONFIG, isProjectLogStageCode } from "@gooes/domain";
import {
  CalendarDays,
  ImageIcon,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectLogImagePreviewDialog, type ProjectLogImagePreviewState } from "@/components/projects/project-log-image-preview-dialog";
import type { ProjectRecord } from "@/components/projects/project-mutations";
import { requestBackendJson } from "@/lib/backend-client";

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

type ProjectLogsData = {
  list: ProjectLogRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

async function requestBackend<T>(path: string) {
  return requestBackendJson<T>(path, {
    fallbackMessage: "请求失败",
  });
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

function stageLabel(log: ProjectLogRecord) {
  if (log.stage_label) return log.stage_label;
  return isProjectLogStageCode(log.stage_code)
    ? PROJECT_LOG_STAGE_CONFIG[log.stage_code].label
    : log.stage_code || "未标记阶段";
}

function employeeName(log: ProjectLogRecord) {
  return log.employee?.name || "未命名员工";
}

function ProjectLogSkeleton() {
  return (
    <div className="overflow-hidden border-y bg-background/60">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="border-b px-4 py-4 last:border-b-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </div>
            <Skeleton className="h-3 w-28 shrink-0" />
          </div>
          <div className="mt-3 flex gap-2">
            <Skeleton className="size-14" />
            <Skeleton className="size-14" />
            <Skeleton className="size-14" />
          </div>
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
  const [total, setTotal] = useState(0);
  const [preview, setPreview] = useState<ProjectLogImagePreviewState>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    requestBackend<ProjectLogsData>(
      `/project-logs/projects?project_id=${project.id}&page=1&pageSize=10`,
    )
      .then((logData) => {
        if (cancelled) return;
        setLogs(logData.list || []);
        setTotal(logData.pagination?.total || 0);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "施工日志加载失败");
          setLogs([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, project.id]);

  return (
    <>
      <div className="flex flex-col gap-4">
        {error ? <StatusAlert>{error}</StatusAlert> : null}

        {loading ? (
          <ProjectLogSkeleton />
        ) : logs.length > 0 ? (
          <div className="overflow-hidden border-y bg-background/60">
            {logs.map((log) => (
              <article key={log.id} className="border-b px-4 py-4 last:border-b-0">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 className="text-sm font-medium leading-5">
                          {stageLabel(log)}
                        </h4>
                        {log.node_name ? (
                          <span className="text-xs text-muted-foreground">
                            {log.node_name}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {log.content}
                      </p>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="size-3" />
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>

                  {log.images.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {log.images.slice(0, 6).map((image, index) => (
                        <button
                          key={`${image}-${index}`}
                          type="button"
                          className="block size-14 shrink-0 overflow-hidden rounded border bg-muted p-0 transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setPreview({
                            images: log.images,
                            index,
                            title: `${stageLabel(log)} - ${formatDateTime(log.created_at)}`,
                          })}
                          aria-label={`查看施工日志图片 ${index + 1}`}
                        >
                          <img src={image} alt="施工日志图片" className="size-full object-cover" />
                        </button>
                      ))}
                      {log.images.length > 6 ? (
                        <button
                          type="button"
                          className="flex size-14 shrink-0 items-center justify-center rounded border bg-muted p-0 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setPreview({
                            images: log.images,
                            index: 6,
                            title: `${stageLabel(log)} - ${formatDateTime(log.created_at)}`,
                          })}
                          aria-label={`查看其余 ${log.images.length - 6} 张施工日志图片`}
                        >
                          +{log.images.length - 6}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
          <div className="border-y bg-background/60 px-4 py-10 text-center text-sm text-muted-foreground">
            暂无施工日志
          </div>
        )}

        {total > logs.length ? (
          <div className="text-center text-xs text-muted-foreground">
            已展示最近 {logs.length} 条，共 {total} 条
          </div>
        ) : null}
      </div>

      {preview ? (
        <ProjectLogImagePreviewDialog
          preview={preview}
          onPreviewChange={setPreview}
        />
      ) : null}
    </>
  );
}
