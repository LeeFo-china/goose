"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  EmployeeOption,
  ProjectConstructionStagesResponse,
  ProjectRecord,
  ProjectStatusActionItem,
  ProjectStatusActionsResponse,
  ProjectStatusTransitionRecord,
} from "@/components/projects/project-mutation-types";
import {
  blockedProjectActions,
  buildProjectActionViews,
  customerStatus,
  formatMoney,
  isProjectStatusActionVisible,
  requestProject,
} from "@/components/projects/project-mutation-utils";
import { requestBackendJson } from "@/lib/backend-client";

export function useProjectStatusPanel(
  project: ProjectRecord,
  onChanged: () => Promise<void>,
) {
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

  function resetActionDialog() {
    setSelectedAction(null);
    setReason("");
    setSignedAmount("");
    setConstructionStartDate("");
    setConstructionManagerKeyword("");
    setConstructionManagerCandidates([]);
    setConstructionManagerEmployeeId("");
  }

  function closeActionDialog() {
    if (pending) return;
    resetActionDialog();
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
        resetActionDialog();
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

  return {
    actions,
    actionViews,
    actionsData,
    actionsLoading,
    amountSummary,
    closeActionDialog,
    constructionManagerCandidates,
    constructionManagerEmployee,
    constructionManagerEmployeeId,
    constructionManagerKeyword,
    constructionManagerLoading,
    constructionStagesLoading,
    constructionStartDate,
    currentStatus,
    error,
    latestTransitions,
    openActionDialog,
    pending,
    reason,
    selectedAction,
    setConstructionManagerEmployeeId,
    setConstructionManagerKeyword,
    setConstructionStartDate,
    setReason,
    setSignedAmount,
    signedAmount,
    startAcceptanceBlockedReason,
    submitAction,
    transitions,
    transitionsLoaded,
    transitionsLoading,
  };
}
