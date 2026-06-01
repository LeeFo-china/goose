"use client";

import { useCallback, useEffect, useState } from "react";
import { PROJECT_LOG_STAGE_CONFIG, isProjectLogStageCode } from "@gooes/domain";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Loader2,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
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

type ImagePreviewState = {
  images: string[];
  index: number;
  title: string;
} | null;

function ProjectLogImagePreviewDialog({
  preview,
  onPreviewChange,
}: {
  preview: NonNullable<ImagePreviewState>;
  onPreviewChange: (preview: ImagePreviewState) => void;
}) {
  const imageCount = preview.images.length;
  const currentImage = preview.images[preview.index] || preview.images[0] || "";
  const canNavigate = imageCount > 1;

  const goToIndex = useCallback((nextIndex: number) => {
    if (imageCount === 0) return;
    onPreviewChange({
      ...preview,
      index: (nextIndex + imageCount) % imageCount,
    });
  }, [imageCount, onPreviewChange, preview]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && canNavigate) {
        event.preventDefault();
        goToIndex(preview.index - 1);
      }
      if (event.key === "ArrowRight" && canNavigate) {
        event.preventDefault();
        goToIndex(preview.index + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canNavigate, goToIndex, preview.index]);

  return (
    <Dialog open onOpenChange={(open) => !open && onPreviewChange(null)}>
      <DialogContent className="max-h-[92vh] max-w-[1040px] overflow-hidden p-0">
        <DialogHeader className="border-b p-5">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle>{preview.title}</DialogTitle>
              <DialogDescription>
                {preview.index + 1} / {imageCount}
              </DialogDescription>
            </div>
            {currentImage ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={currentImage} target="_blank" rel="noreferrer">
                  查看原图
                </a>
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <div className="relative flex h-[min(72vh,720px)] items-center justify-center bg-muted/40 p-4">
          {canNavigate ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/90"
              onClick={() => goToIndex(preview.index - 1)}
              aria-label="上一张"
            >
              <ChevronLeft />
            </Button>
          ) : null}

          {currentImage ? (
            <img
              src={currentImage}
              alt={`施工日志图片 ${preview.index + 1}`}
              className="max-h-full max-w-full rounded-md object-contain"
            />
          ) : (
            <div className="text-sm text-muted-foreground">图片不可用</div>
          )}

          {canNavigate ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/90"
              onClick={() => goToIndex(preview.index + 1)}
              aria-label="下一张"
            >
              <ChevronRight />
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
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
  const [preview, setPreview] = useState<ImagePreviewState>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    requestBackend<ProjectLogsData>(
      `/project_logs/projects?project_id=${project.id}&page=1&pageSize=10`,
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
      <div className="flex flex-col gap-5">
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
                      {log.images.slice(0, 6).map((image, index) => (
                        <Button
                          key={image}
                          type="button"
                          variant="ghost"
                          className="block size-20 shrink-0 overflow-hidden rounded-md border bg-muted p-0 transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setPreview({
                            images: log.images,
                            index,
                            title: `${stageLabel(log)} · ${formatDateTime(log.created_at)}`,
                          })}
                        >
                          <img src={image} alt="施工日志图片" className="size-full object-cover" />
                        </Button>
                      ))}
                      {log.images.length > 6 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="flex size-20 shrink-0 items-center justify-center rounded-md border bg-muted p-0 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setPreview({
                            images: log.images,
                            index: 6,
                            title: `${stageLabel(log)} · ${formatDateTime(log.created_at)}`,
                          })}
                        >
                          +{log.images.length - 6}
                        </Button>
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

      {preview ? (
        <ProjectLogImagePreviewDialog
          preview={preview}
          onPreviewChange={setPreview}
        />
      ) : null}
    </>
  );
}
