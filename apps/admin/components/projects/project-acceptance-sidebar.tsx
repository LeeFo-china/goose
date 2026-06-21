"use client";

import { RefreshCw, Loader2, Plus, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectLogStageCode } from "@gooes/domain";
import type { AcceptanceTemplate, ConstructionStageItem, ProjectAcceptance } from "@/components/projects/project-acceptance-types";
import { formatDateTime, getAcceptanceDisplayTitle, isFinalAcceptance, statusVariant } from "@/components/projects/project-acceptance-utils";
import { cn } from "@/lib/utils";

type ProjectAcceptanceSidebarProps = {
  loading: boolean;
  actionLoading: boolean;
  templateLoading: boolean;
  acceptances: ProjectAcceptance[];
  selectedId: string;
  stageCode: ProjectLogStageCode;
  selectableStageOptions: Array<{
    value: ProjectLogStageCode;
    label: string;
    acceptance?: ProjectAcceptance;
    constructionStage?: ConstructionStageItem;
    disabled: boolean;
    stateLabel: string;
  }>;
  finalAcceptanceBlockedReason: string;
  canCreateFinalAcceptance: boolean;
  canCreateAcceptance: boolean;
  canCreateByProjectStatus: boolean;
  firstAvailableStage?: { value: ProjectLogStageCode } | null;
  selectedStageBlocked: boolean;
  selectedStageBlockedReason: string;
  onRefresh: () => void;
  onCreateFinalAcceptance: () => void;
  onOpenTemplateDialog: () => void;
  onStageCodeChange: (stageCode: ProjectLogStageCode) => void;
  onCreateAcceptance: () => void;
  onSelectedIdChange: (id: string) => void;
};

export function ProjectAcceptanceSidebar({
  loading,
  actionLoading,
  templateLoading,
  acceptances,
  selectedId,
  stageCode,
  selectableStageOptions,
  finalAcceptanceBlockedReason,
  canCreateFinalAcceptance,
  canCreateAcceptance,
  canCreateByProjectStatus,
  firstAvailableStage,
  selectedStageBlocked,
  selectedStageBlockedReason,
  onRefresh,
  onCreateFinalAcceptance,
  onOpenTemplateDialog,
  onStageCodeChange,
  onCreateAcceptance,
  onSelectedIdChange,
}: ProjectAcceptanceSidebarProps) {
  return (
          <aside className="min-h-0">
            <div className="flex h-full min-h-0 flex-col rounded-md border bg-card">
              <div className="border-b p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>项目验收</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={onRefresh}
                    disabled={loading}
                    aria-label="刷新验收列表"
                  >
                    <RefreshCw className={loading ? "animate-spin" : ""} />
                  </Button>
                </div>
                <div className="mt-3 rounded-md border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">竣工交付验收</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        施工阶段全部完成后发起
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={onCreateFinalAcceptance}
                      disabled={actionLoading || !canCreateFinalAcceptance}
                    >
                      {actionLoading
                        ? <Loader2 className="animate-spin" data-icon="inline-start" />
                        : <Plus data-icon="inline-start" />}
                      发起
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onOpenTemplateDialog}
                      disabled={templateLoading}
                    >
                      {templateLoading
                        ? <Loader2 className="animate-spin" data-icon="inline-start" />
                        : <FileText data-icon="inline-start" />}
                      模板
                    </Button>
                  </div>
                  {finalAcceptanceBlockedReason ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {finalAcceptanceBlockedReason}
                    </p>
                  ) : null}
                </div>
                <div className="mt-2 space-y-2">
                  <Label className="text-xs text-muted-foreground">工序验收</Label>
                  <Select
                    value={stageCode}
                    onValueChange={(value) => onStageCodeChange(value as ProjectLogStageCode)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableStageOptions.map((item) => (
                        <SelectItem
                          key={item.value}
                          value={item.value}
                          disabled={item.disabled}
                        >
                          {item.disabled ? `${item.label}（${item.stateLabel}）` : item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={onCreateAcceptance}
                    disabled={actionLoading || !canCreateAcceptance}
                  >
                    {actionLoading
                      ? <Loader2 className="animate-spin" data-icon="inline-start" />
                      : <Plus data-icon="inline-start" />}
                    发起验收
                  </Button>
                </div>
                {!canCreateByProjectStatus ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    仅施工中或验收中的项目可发起工序验收
                  </p>
                ) : !firstAvailableStage ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    当前无可发起的工序验收
                  </p>
                ) : selectedStageBlocked ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedStageBlockedReason}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                <span>验收项目</span>
                <span>{acceptances.length} 个记录</span>
              </div>

              <div className="p-1">
                {acceptances.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    暂无验收记录
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {acceptances.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-auto w-full justify-start rounded-md px-3 py-2.5 text-left font-normal transition-colors hover:bg-accent",
                          item.id === selectedId ? "bg-accent" : "bg-transparent",
                        )}
                        onClick={() => onSelectedIdChange(item.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate text-sm font-medium">
                            {getAcceptanceDisplayTitle(item)}
                          </div>
                          <Badge variant={statusVariant(item.status)}>
                            {item.status_label}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{formatDateTime(item.updated_at || item.created_at)}</span>
                          <span>
                            {isFinalAcceptance(item) ? "竣工" : "工序"} · {item.items.length} 项
                          </span>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
  );
}
