"use client";

import { FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { useProjectAcceptancesPanel } from "@/components/projects/project-acceptances-panel-state";
import {
  formatDateTime,
  getAcceptanceDisplayTitle,
  isFinalAcceptance,
  statusVariant,
} from "@/components/projects/project-acceptance-utils";
import { cn } from "@/lib/utils";

type AcceptancePanelState = ReturnType<typeof useProjectAcceptancesPanel>;

export function ProjectAcceptanceStageList({
  panel,
}: {
  panel: AcceptancePanelState;
}) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col rounded-md border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">验收记录</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              共 {panel.summary.total} 个，进行中 {panel.summary.pending} 个，已完成{" "}
              {panel.summary.completed} 个
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={panel.loadAcceptances}
            disabled={panel.loading}
            aria-label="刷新验收记录"
          >
            <RefreshCw className={panel.loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      <div className="border-b px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">竣工交付验收</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {panel.finalAcceptanceBlockedReason || "施工阶段全部完成后可发起"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              onClick={panel.createFinalAcceptance}
              disabled={panel.actionLoading || !panel.canCreateFinalAcceptance}
            >
              {panel.actionLoading ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              发起
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={panel.openTemplateDialog}
              disabled={panel.templateLoading}
            >
              <FileText data-icon="inline-start" />
              模板
            </Button>
          </div>
        </div>
      </div>

      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">工序验收</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {panel.firstAvailableStage
                ? `当前可发起：${panel.firstAvailableStage.label}`
                : "当前无可发起的工序验收"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => panel.createAcceptanceForStage(panel.firstAvailableStage?.value)}
            disabled={panel.actionLoading || !panel.canCreateAcceptance}
          >
            {panel.actionLoading ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Plus data-icon="inline-start" />
            )}
            发起{panel.firstAvailableStage ? panel.firstAvailableStage.label : "验收"}
          </Button>
        </div>
        {!panel.canCreateByProjectStatus ? (
          <p className="mt-2 text-xs text-muted-foreground">
            仅施工中或验收中的项目可发起工序验收
          </p>
        ) : panel.selectedStageBlockedReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {panel.selectedStageBlockedReason}
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {panel.selectableStageOptions.map((item) => {
            const disabled = Boolean(
              item.acceptance || item.constructionStage?.blocked_reason,
            );
            const stateLabel = item.acceptance
              ? item.acceptance.status_label
              : item.constructionStage?.blocked_reason
                ? "未解锁"
                : "可发起";

            return (
              <button
                key={item.value}
                type="button"
                disabled={panel.actionLoading || disabled}
                onClick={() => panel.createAcceptanceForStage(item.value)}
                className={cn(
                  "min-w-0 rounded-md border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  disabled
                    ? "cursor-not-allowed bg-muted/40 text-muted-foreground"
                    : "bg-background hover:bg-accent",
                )}
              >
                <span className="block truncate text-xs font-medium">
                  {item.label}
                </span>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                  {stateLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-gutter:stable]">
        {panel.acceptances.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            暂无验收记录。
            {panel.firstAvailableStage
              ? `可先发起${panel.firstAvailableStage.label}。`
              : "请先完成前置工序或检查项目状态。"}
          </div>
        ) : (
          <div className="grid gap-1.5">
            {panel.acceptances.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.id === panel.selectedId
                    ? "border-primary bg-accent"
                    : "bg-background",
                )}
                onClick={() => panel.setSelectedId(item.id)}
                aria-current={item.id === panel.selectedId ? "true" : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {getAcceptanceDisplayTitle(item)}
                  </span>
                  <Badge variant={statusVariant(item.status)}>
                    {item.status_label}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {isFinalAcceptance(item) ? "竣工" : "工序"} · {item.items.length} 项
                  </span>
                  <span>{formatDateTime(item.updated_at || item.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
