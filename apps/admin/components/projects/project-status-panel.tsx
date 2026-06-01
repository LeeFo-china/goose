"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, History, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectStatusActionDialog } from "@/components/projects/project-status-action-dialog";
import type { EmployeeOption, ProjectConstructionStagesResponse, ProjectRecord, ProjectStatusActionsResponse, ProjectStatusActionItem, ProjectStatusTransitionRecord } from "@/components/projects/project-mutation-types";
import { blockedProjectActions, buildProjectActionViews, customerName, customerStatus, formatDate, formatDateTime, formatMoney, getEmployeeMeta, getEmployeeOptionLabel, isProjectStatusActionVisible, personName, projectActionLabel, projectStatusBadgeVariant, projectStatusLabel, propertyLabel, requestProject } from "@/components/projects/project-mutation-utils";
import { requestBackendJson } from "@/lib/backend-client";

export function ProjectStatusPanel({
  project,
  onChanged,
}: {
  project: ProjectRecord;
  onChanged: () => Promise<void>;
}) {
  const [actionsData, setActionsData] = useState<ProjectStatusActionsResponse | null>(null);
  const [constructionStages, setConstructionStages] =
    useState<ProjectConstructionStagesResponse | null>(null);
  const [transitions, setTransitions] = useState<ProjectStatusTransitionRecord[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [constructionStagesLoading, setConstructionStagesLoading] = useState(false);
  const [transitionsLoading, setTransitionsLoading] = useState(false);
  const [transitionsLoaded, setTransitionsLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedAction, setSelectedAction] = useState<ProjectStatusActionItem | null>(null);
  const [reason, setReason] = useState("");
  const [signedAmount, setSignedAmount] = useState("");
  const [constructionStartDate, setConstructionStartDate] = useState("");
  const [constructionManagerKeyword, setConstructionManagerKeyword] = useState("");
  const [constructionManagerCandidates, setConstructionManagerCandidates] = useState<EmployeeOption[]>([]);
  const [constructionManagerEmployeeId, setConstructionManagerEmployeeId] = useState("");
  const [constructionManagerLoading, setConstructionManagerLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setActionsLoading(true);
    setError("");
    setTransitions([]);
    setTransitionsLoaded(false);
    requestProject({ path: `/projects/${project.id}/status-actions` })
      .then((actions) => {
        if (cancelled) return;
        setActionsData(actions as ProjectStatusActionsResponse);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "状态动作加载失败");
      })
      .finally(() => {
        if (!cancelled) setActionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project.id, project.status]);

  useEffect(() => {
    let cancelled = false;
    setConstructionStagesLoading(true);
    requestProject({ path: `/projects/${project.id}/construction-stages` })
      .then((stages) => {
        if (cancelled) return;
        setConstructionStages(stages as ProjectConstructionStagesResponse);
      })
      .catch(() => {
        if (!cancelled) setConstructionStages(null);
      })
      .finally(() => {
        if (!cancelled) setConstructionStagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project.id, project.status]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTransitionsLoading(true);
      requestProject({ path: `/projects/${project.id}/status-transitions?page=1&pageSize=3` })
        .then((timeline) => {
          if (cancelled) return;
          setTransitions((timeline?.rows || []) as ProjectStatusTransitionRecord[]);
          setTransitionsLoaded(true);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "状态时间线加载失败");
        })
        .finally(() => {
          if (!cancelled) setTransitionsLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project.id, project.status]);

  const currentStatus = actionsData?.current_status || project.status;
  const missingConstructionStages = constructionStages?.missing_required_stages || [];
  const missingConstructionStageLabels = missingConstructionStages
    .map((stage) => stage.stage_label)
    .join("、");
  const startAcceptanceBlockedReason =
    currentStatus === "constructing" &&
    constructionStages &&
    !constructionStages.required_completed
      ? `进入竣工验收前，还需完成：${missingConstructionStageLabels || "必需施工阶段验收"}`
      : "";
  const constructionManagerEmployee = constructionManagerCandidates.find(
    (item) => item.id === constructionManagerEmployeeId,
  );

  useEffect(() => {
    if (selectedAction?.action !== "schedule_construction") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "20",
        role_code: "construction_manager",
      });
      const normalizedKeyword = constructionManagerKeyword.trim();
      if (normalizedKeyword) query.set("keyword", normalizedKeyword);

      setConstructionManagerLoading(true);
      requestBackendJson<{ list?: EmployeeOption[] }>(
        `/projects/${project.id}/member-candidates?${query.toString()}`,
        {
        signal: controller.signal,
        cache: "no-store",
          fallbackMessage: "工程负责人候选加载失败",
        },
      )
        .then((data) => {
          setConstructionManagerCandidates(data.list || []);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setConstructionManagerCandidates([]);
          setError(err instanceof Error ? err.message : "工程负责人候选加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setConstructionManagerLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [constructionManagerKeyword, project.id, selectedAction?.action]);

  function closeActionDialog() {
    if (pending) return;
    setSelectedAction(null);
    setReason("");
    setSignedAmount("");
    setConstructionStartDate("");
    setConstructionManagerKeyword("");
    setConstructionManagerCandidates([]);
    setConstructionManagerEmployeeId("");
  }

  function openActionDialog(action: ProjectStatusActionItem) {
    setError("");
    if (
      action.action === "sign_contract" &&
      project.customer_id &&
      !["designing", "signed"].includes(customerStatus(project.customer) || "")
    ) {
      setError("项目签约前，关联客户销售状态必须为设计中或已签约");
      return;
    }
    if (action.action === "start_acceptance" && startAcceptanceBlockedReason) {
      setError(startAcceptanceBlockedReason);
      return;
    }
    setSelectedAction(action);
    setReason("");
    setSignedAmount(action.action === "sign_contract" && project.signed_amount
      ? String(project.signed_amount)
      : "");
    setConstructionStartDate(action.action === "schedule_construction" && project.start_date
      ? project.start_date.slice(0, 10)
      : "");
    setConstructionManagerKeyword("");
    setConstructionManagerCandidates([]);
    setConstructionManagerEmployeeId(action.action === "schedule_construction"
      ? project.members?.find((member) =>
        member.role_code === "construction_manager" && member.is_primary !== false
      )?.employee_id || ""
      : "");
  }

  function submitAction() {
    if (!selectedAction) return;
    const normalizedReason = reason.trim();
    const normalizedSignedAmount = Number(signedAmount);
    if (selectedAction.requires_reason && !normalizedReason) {
      setError("该状态动作必须填写原因");
      return;
    }
    if (
      selectedAction.action === "sign_contract" &&
      (!Number.isFinite(normalizedSignedAmount) || normalizedSignedAmount <= 0)
    ) {
      setError("项目签约时必须填写有效签约金额");
      return;
    }
    if (selectedAction.action === "schedule_construction" && !constructionStartDate) {
      setError("项目排期开工前必须先确定开工日期");
      return;
    }
    if (
      selectedAction.action === "schedule_construction" &&
      !constructionManagerEmployeeId
    ) {
      setError("请选择工程负责人");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        await requestProject({
          path: `/projects/${project.id}/status-transition`,
          method: "POST",
          payload: {
            action: selectedAction.action,
            reason: normalizedReason || undefined,
            signed_amount: selectedAction.action === "sign_contract"
              ? normalizedSignedAmount
              : undefined,
            start_date: selectedAction.action === "schedule_construction"
              ? constructionStartDate
              : undefined,
            construction_manager_employee_id:
              selectedAction.action === "schedule_construction"
                ? constructionManagerEmployeeId
                : undefined,
            metadata: { source: "admin" },
          },
        });
        setSelectedAction(null);
        setReason("");
        setSignedAmount("");
        setConstructionStartDate("");
        setConstructionManagerKeyword("");
        setConstructionManagerCandidates([]);
        setConstructionManagerEmployeeId("");
        await onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "状态变更失败");
      }
    });
  }

  const actions = actionsData?.actions || [];
  const blockedActions = blockedProjectActions(currentStatus).filter((item) =>
    !isProjectStatusActionVisible(actions, item.action)
  );
  const actionViews = buildProjectActionViews(actions, blockedActions);
  const latestTransitions = transitions.slice(0, 3);
  const amountSummary = project.signed_amount
    ? `签约 ¥${formatMoney(project.signed_amount)}`
    : project.budget
      ? `预算 ¥${formatMoney(project.budget)}`
      : "-";
  const headerSummaryRows = [
    [
      ["客户", customerName(project.customer)],
      ["房产", propertyLabel(project.property)],
      ["金额", amountSummary],
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
            <Badge variant={projectStatusBadgeVariant(currentStatus)}>
              {projectStatusLabel(currentStatus)}
            </Badge>
            {actionsData?.paused_from_status ? (
              <Badge variant="outline">
                暂停前：{projectStatusLabel(actionsData.paused_from_status)}
              </Badge>
            ) : null}
            {actionsLoading ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                动作加载中
              </Badge>
            ) : null}
            {constructionStagesLoading ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                工序同步中
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5">
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {!error && startAcceptanceBlockedReason ? (
          <StatusAlert>{startAcceptanceBlockedReason}</StatusAlert>
        ) : null}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">最近流转</h3>
            </div>
            {transitions.length > latestTransitions.length ? (
              <Badge variant="outline">显示最近 {latestTransitions.length} 条</Badge>
            ) : transitionsLoading ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                加载中
              </Badge>
            ) : null}
          </div>
          {!transitionsLoaded ? (
            <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
              最近流转正在后台同步。
            </div>
          ) : latestTransitions.length > 0 ? (
            <div className="flex flex-col divide-y rounded-md border bg-background">
              {latestTransitions.map((item) => (
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
                {actionViews.map((item) => {
                  const actionBlockedReason =
                    item.action.action === "start_acceptance"
                      ? startAcceptanceBlockedReason
                      : "";
                  if (item.kind === "enabled" && !actionBlockedReason) {
                    return (
                      <Button
                        key={item.action.action}
                        type="button"
                        size="sm"
                        variant={item.action.action === "mark_invalid" ? "destructive" : "outline"}
                        disabled={actionsLoading || pending}
                        onClick={() => openActionDialog(item.action)}
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
                {!actionsLoading && actions.length === 0 ? (
                  <Badge variant="outline">暂无可执行动作</Badge>
                ) : null}
              </div>
            </TooltipProvider>
          </div>
        </section>
      </CardContent>
      <ProjectStatusActionDialog
        selectedAction={selectedAction}
        pending={pending}
        signedAmount={signedAmount}
        setSignedAmount={setSignedAmount}
        constructionStartDate={constructionStartDate}
        setConstructionStartDate={setConstructionStartDate}
        constructionManagerKeyword={constructionManagerKeyword}
        setConstructionManagerKeyword={setConstructionManagerKeyword}
        constructionManagerLoading={constructionManagerLoading}
        constructionManagerCandidates={constructionManagerCandidates}
        constructionManagerEmployeeId={constructionManagerEmployeeId}
        setConstructionManagerEmployeeId={setConstructionManagerEmployeeId}
        constructionManagerEmployee={constructionManagerEmployee}
        reason={reason}
        setReason={setReason}
        closeActionDialog={closeActionDialog}
        submitAction={submitAction}
      />
    </Card>
  );
}
