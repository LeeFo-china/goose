"use client";

import { ArrowRight, History, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectStatusActionDialog } from "@/components/projects/project-status-action-dialog";
import { useProjectStatusPanel } from "@/components/projects/project-status-panel-state";
import { WorkflowSubjectStatePanel } from "@/components/workflows/workflow-subject-state-panel";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import {
  customerName,
  formatDate,
  formatDateTime,
  personName,
  projectDisplayStatusBadgeVariant,
  projectDisplayStatusLabel,
  projectActionLabel,
  projectStatusBadgeVariant,
  projectStatusLabel,
  propertyLabel,
} from "@/components/projects/project-mutation-utils";

export function ProjectStatusPanel({
  project,
  onChanged,
}: {
  project: ProjectRecord;
  onChanged: () => Promise<void>;
}) {
  const panel = useProjectStatusPanel(project, onChanged);
  const headerSummaryRows = [
    [
      ["客户", customerName(project.customer)],
      ["房产", propertyLabel(project.property)],
      ["金额", panel.amountSummary],
    ],
    [
      ["设计", personName(project.designer)],
      ["工程", personName(project.supervisor)],
      ["开工", formatDate(project.start_date)],
      ...(project.address ? [["地址", project.address]] : []),
    ],
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate">{project.name || "项目概览"}</CardTitle>
            <CardDescription className="mt-3 flex flex-col gap-1.5">
              {headerSummaryRows.map((row, rowIndex) => (
                <span key={rowIndex} className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
                  {row.map(([label, value]) => (
                    <span key={label} className="min-w-0 truncate">
                      {label}：{value}
                    </span>
                  ))}
                </span>
              ))}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={projectDisplayStatusBadgeVariant(project)}>
              {projectDisplayStatusLabel(project)}
            </Badge>
            {panel.actionsData?.paused_from_status ? (
              <Badge variant="outline">
                暂停前：{projectStatusLabel(panel.actionsData.paused_from_status)}
              </Badge>
            ) : null}
            {panel.actionsLoading ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                动作加载中
              </Badge>
            ) : null}
            {panel.constructionStagesLoading ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                工序同步中
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5">
        {panel.error ? <StatusAlert>{panel.error}</StatusAlert> : null}
        {!panel.error && panel.startAcceptanceBlockedReason ? (
          <StatusAlert>{panel.startAcceptanceBlockedReason}</StatusAlert>
        ) : null}
        <WorkflowSubjectStatePanel
          subjectType="project"
          subjectId={project.id}
          onStateChange={panel.setWorkflowState}
        />
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">最近流转</h3>
            </div>
            {panel.transitions.length > panel.latestTransitions.length ? (
              <Badge variant="outline">显示最近 {panel.latestTransitions.length} 条</Badge>
            ) : panel.transitionsLoading ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                加载中
              </Badge>
            ) : null}
          </div>
          {!panel.transitionsLoaded ? (
            <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
              最近流转正在后台同步。
            </div>
          ) : panel.latestTransitions.length > 0 ? (
            <div className="flex flex-col divide-y rounded-md border bg-background">
              {panel.latestTransitions.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{projectActionLabel(item.action)}</span>
                    <Badge variant={projectStatusBadgeVariant(item.from_status)}>
                      {projectStatusLabel(item.from_status)}
                    </Badge>
                    <ArrowRight className="size-4 text-muted-foreground" />
                    <Badge variant={projectStatusBadgeVariant(item.to_status)}>
                      {projectStatusLabel(item.to_status)}
                    </Badge>
                    {item.reason ? (
                      <span className="truncate text-muted-foreground">{item.reason}</span>
                    ) : null}
                  </div>
                  <time
                    dateTime={item.created_at}
                    className="shrink-0 text-xs tabular-nums text-muted-foreground"
                  >
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
        <section className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">下一步</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                只展示当前可执行的推进动作。
              </p>
            </div>
            <TooltipProvider>
              <div className="flex flex-wrap items-center gap-2">
                {panel.actionViews.map((item) => {
                  const actionBlockedReason =
                    item.action.action === "start_acceptance"
                      ? panel.startAcceptanceBlockedReason
                      : "";
                  if (item.kind === "enabled" && !actionBlockedReason) {
                    return (
                      <Button
                        key={item.action.action}
                        type="button"
                        size="sm"
                        variant={item.action.action === "mark_invalid" ? "destructive" : "outline"}
                        disabled={panel.actionsLoading || panel.pending}
                        onClick={() => panel.openActionDialog(item.action)}
                      >
                        {item.action.label}
                      </Button>
                    );
                  }

                  const tooltipReason = actionBlockedReason ||
                    (item.kind === "blocked" ? item.action.reason : "当前不能执行该动作");

                  return (
                    <Tooltip key={item.action.action}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled
                          >
                            {item.action.label}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {tooltipReason}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                {!panel.actionsLoading && panel.actions.length === 0 ? (
                  <Badge variant="outline">暂无可执行动作</Badge>
                ) : null}
              </div>
            </TooltipProvider>
          </div>
        </section>
      </CardContent>
      <ProjectStatusActionDialog
        selectedAction={panel.selectedAction}
        pending={panel.pending}
        signedAmount={panel.signedAmount}
        setSignedAmount={panel.setSignedAmount}
        constructionStartDate={panel.constructionStartDate}
        setConstructionStartDate={panel.setConstructionStartDate}
        constructionManagerKeyword={panel.constructionManagerKeyword}
        setConstructionManagerKeyword={panel.setConstructionManagerKeyword}
        constructionManagerLoading={panel.constructionManagerLoading}
        constructionManagerCandidates={panel.constructionManagerCandidates}
        constructionManagerEmployeeId={panel.constructionManagerEmployeeId}
        setConstructionManagerEmployeeId={panel.setConstructionManagerEmployeeId}
        constructionManagerEmployee={panel.constructionManagerEmployee}
        reason={panel.reason}
        setReason={panel.setReason}
        closeActionDialog={panel.closeActionDialog}
        submitAction={panel.submitAction}
      />
    </Card>
  );
}
