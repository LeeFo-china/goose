"use client";

import {
  Archive,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkflowVersionSummary } from "./workflow-types";

const versionStatusLabels: Record<WorkflowVersionSummary["status"], string> = {
  published: "已发布",
  deprecated: "已废弃",
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

export function WorkflowVersionInlineContent({
  activeVersionId,
  className,
  error,
  hasNextPage,
  hasPreviousPage,
  page,
  pending,
  total,
  totalPages,
  versions,
  onActivateVersion,
  onArchiveVersion,
  onNextPage,
  onPreviousPage,
  onRefresh,
}: {
  activeVersionId: string | null;
  className?: string;
  error: string | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  page: number;
  pending: boolean;
  total: number;
  totalPages: number;
  versions: WorkflowVersionSummary[];
  onActivateVersion: (version: WorkflowVersionSummary) => void;
  onArchiveVersion: (version: WorkflowVersionSummary) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onRefresh: () => void;
}) {
  const isInitialLoading = pending && versions.length === 0 && !error;
  const pageLabel = totalPages > 0 ? `${page} / ${totalPages}` : "0 / 0";

  return (
    <div
      data-testid="workflow-version-inline-list"
      className={cn("min-w-0", className)}
    >
      <div className="flex items-center justify-between gap-3 pb-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">发布版本</div>
          <div className="text-xs text-muted-foreground">
            共 {total} 个版本
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onRefresh}
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
        <div className="pt-2">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}

      <div className="max-h-72 overflow-auto">
        {isInitialLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            正在加载版本
          </div>
        ) : versions.length > 0 ? (
          <div className="divide-y border-y">
            {versions.map((version) => {
              const isActive = version.id === activeVersionId;
              const isArchived = version.status === "deprecated";
              const versionLabel = version.version_label?.trim();
              const activateDisabled = pending || isActive || isArchived;
              const archiveDisabled = pending ||
                isActive ||
                isArchived ||
                version.running_instance_count > 0;

              return (
                <div
                  key={version.id}
                  data-testid="workflow-version-inline-item"
                  className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">v{version.version_number}</span>
                      <Badge variant={isActive ? "success" : "outline"}>
                        {isActive ? "当前版本" : "历史版本"}
                      </Badge>
                      <Badge variant="secondary">
                        {versionStatusLabels[version.status] || version.status}
                      </Badge>
                      <Badge
                        variant={version.running_instance_count > 0
                          ? "warning"
                          : "outline"}
                      >
                        运行中 {version.running_instance_count}
                      </Badge>
                    </div>
                    <div className={cn(
                      "max-w-[36rem] truncate text-sm",
                      versionLabel ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {versionLabel || "未填写版本标签"}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>发布 {formatDateTime(version.published_at)}</span>
                      <span className="max-w-[18rem] truncate tabular-nums">
                        {version.id}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={activateDisabled}
                      onClick={() => onActivateVersion(version)}
                    >
                      <CheckCircle2 data-icon="inline-start" />
                      {isActive ? "当前版本" : "设为当前"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={archiveDisabled}
                      onClick={() => onArchiveVersion(version)}
                    >
                      <Archive data-icon="inline-start" />
                      {isArchived ? "已归档" : "归档"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            暂无发布版本
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
        <span>第 {pageLabel} 页</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasPreviousPage || pending}
            onClick={onPreviousPage}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNextPage || pending}
            onClick={onNextPage}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
