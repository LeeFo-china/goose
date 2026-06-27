"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  History,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { StatusAlert } from "@/components/admin/status-alert";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  activateWorkflowVersion,
  archiveWorkflowVersion,
  fetchWorkflowVersions,
} from "./workflow-requests";
import { WorkflowVersionInlineContent } from "./workflow-version-inline-content";
import { WORKFLOW_VERSION_EFFECT_COPY } from "./workflow-version-semantics";
import type {
  WorkflowVersionListData,
  WorkflowVersionSummary,
} from "./workflow-types";

const FULL_VERSION_PAGE_SIZE = 20;
const INLINE_VERSION_PAGE_SIZE = 3;

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

export function WorkflowVersionListPanel({
  workflowId,
  activeVersionId,
  className,
  compact = false,
  defaultOpen = false,
}: {
  workflowId: string;
  activeVersionId?: string | null;
  className?: string;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<WorkflowVersionListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<WorkflowVersionSummary | null>(null);
  const [activateTarget, setActivateTarget] = useState<WorkflowVersionSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const pageSize = compact ? INLINE_VERSION_PAGE_SIZE : FULL_VERSION_PAGE_SIZE;

  function loadVersions(nextPage = page) {
    startTransition(async () => {
      try {
        setError(null);
        const result = await fetchWorkflowVersions(workflowId, {
          page: nextPage,
          pageSize,
        });
        setPage(nextPage);
        setData(result);
      } catch (loadError) {
        setError(loadError instanceof Error
          ? loadError.message
          : "流程版本列表加载失败");
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && !data && !pending) {
      loadVersions(1);
    }
  }

  function confirmArchiveVersion() {
    if (!archiveTarget) return;
    startTransition(async () => {
      try {
        setError(null);
        await archiveWorkflowVersion(workflowId, archiveTarget.id);
        const result = await fetchWorkflowVersions(workflowId, {
          page,
          pageSize,
        });
        setData(result);
        setArchiveTarget(null);
      } catch (archiveError) {
        setError(archiveError instanceof Error
          ? archiveError.message
          : "流程版本归档失败");
      }
    });
  }

  function confirmActivateVersion() {
    if (!activateTarget) return;
    startTransition(async () => {
      try {
        setError(null);
        await activateWorkflowVersion(workflowId, activateTarget.id);
        const result = await fetchWorkflowVersions(workflowId, {
          page,
          pageSize,
        });
        setData(result);
        setActivateTarget(null);
      } catch (activateError) {
        setError(activateError instanceof Error
          ? activateError.message
          : "设置当前版本失败");
      }
    });
  }

  useEffect(() => {
    setOpen(defaultOpen);
    setPage(1);
    setData(null);
    setError(null);
    if (defaultOpen) {
      loadVersions(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, defaultOpen]);

  const versions = data?.list ?? [];
  const activeVersionIdFromData = versions.find((version) => version.is_active)?.id ??
    activeVersionId ??
    null;
  const totalPages = data?.pagination.totalPages ?? 0;
  const hasPreviousPage = page > 1;
  const hasNextPage = totalPages > 0 && page < totalPages;
  const actionDialogs = (
    <>
      <ConfirmActionDialog
        open={Boolean(activateTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setActivateTarget(null);
        }}
        title="设为当前版本"
        description="设为当前版本后，只影响后续新建或受控重建的实例；运行中的实例仍绑定原版本。"
        confirmLabel="确认设置"
        pending={pending}
        onConfirm={confirmActivateVersion}
      />
      <ConfirmActionDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setArchiveTarget(null);
        }}
        title="归档流程版本"
        description="归档后该历史版本不再作为可用发布版本展示，但已绑定的实例审计记录会保留。"
        confirmLabel="确认归档"
        pending={pending}
        onConfirm={confirmArchiveVersion}
      />
    </>
  );

  if (compact) {
    return (
      <>
        <WorkflowVersionInlineContent
          activeVersionId={activeVersionIdFromData}
          className={className}
          error={error}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          page={page}
          pending={pending}
          total={data?.pagination.total ?? 0}
          totalPages={totalPages}
          versions={versions}
          onActivateVersion={setActivateTarget}
          onArchiveVersion={setArchiveTarget}
          onNextPage={() => loadVersions(page + 1)}
          onPreviousPage={() => loadVersions(page - 1)}
          onRefresh={() => loadVersions(page)}
        />
        {actionDialogs}
      </>
    );
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={cn(
        "rounded-md border bg-background shadow-sm",
        className,
      )}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/30"
        >
          <span className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
              <History className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold tracking-normal">
                {WORKFLOW_VERSION_EFFECT_COPY.versionPanelTitle}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {WORKFLOW_VERSION_EFFECT_COPY.versionPanelDescription}
              </span>
            </span>
          </span>
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="text-sm text-muted-foreground">
              共 {data?.pagination.total ?? 0} 个发布版本
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => loadVersions(page)}
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
            <div className="px-4 pb-4">
              <StatusAlert>{error}</StatusAlert>
            </div>
          ) : null}

          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>版本</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>运行中实例</TableHead>
                  <TableHead>发布时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.length > 0 ? (
                  versions.map((version) => {
                    const isActive = version.id === activeVersionIdFromData;
                    const isArchived = version.status === "deprecated";
                    const versionLabel = version.version_label?.trim();
                    const activateDisabled = pending || isActive || isArchived;
                    const archiveDisabled = pending ||
                      isActive ||
                      isArchived ||
                      version.running_instance_count > 0;
                    return (
                      <TableRow key={version.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="font-medium">
                              v{version.version_number}
                            </div>
                            {versionLabel ? (
                              <div className="max-w-[220px] truncate text-sm text-foreground">
                                {versionLabel}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">
                                未填写版本标签
                              </div>
                            )}
                            <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                              {version.id}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={isActive ? "success" : "outline"}>
                              {isActive ? "当前版本" : "历史版本"}
                            </Badge>
                            <Badge variant="secondary">
                              {versionStatusLabels[version.status] || version.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={version.running_instance_count > 0
                              ? "warning"
                              : "outline"}
                          >
                            {version.running_instance_count} 个
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(version.published_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={activateDisabled}
                              onClick={() => setActivateTarget(version)}
                            >
                              <CheckCircle2 data-icon="inline-start" />
                              {isActive ? "当前版本" : "设为当前版本"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={archiveDisabled}
                              onClick={() => setArchiveTarget(version)}
                            >
                              <Archive data-icon="inline-start" />
                              {isArchived ? "已归档" : "归档版本"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      暂无发布版本
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              第 {totalPages > 0 ? page : 0} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasPreviousPage || pending}
                onClick={() => loadVersions(page - 1)}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNextPage || pending}
                onClick={() => loadVersions(page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleContent>
      {actionDialogs}
    </Collapsible>
  );
}

export function WorkflowVersionInlineList({
  workflowId,
  activeVersionId,
  className,
}: {
  workflowId: string;
  activeVersionId?: string | null;
  className?: string;
}) {
  return (
    <WorkflowVersionListPanel
      activeVersionId={activeVersionId}
      compact
      defaultOpen
      workflowId={workflowId}
      className={className}
    />
  );
}
