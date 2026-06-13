"use client";

import { useEffect, useState, useTransition } from "react";
import {
  isProjectStatus,
  isProjectStatusAction,
  type ProjectStatusAction,
} from "@gooes/domain";
import type {
  EmployeeOption,
  ProjectConstructionStagesResponse,
  ProjectRecord,
  ProjectStatusActionItem,
} from "@/components/projects/project-mutation-types";
import {
  blockedProjectActions,
  buildProjectActionViews,
  customerStatus,
  formatMoney,
  isProjectStatusActionVisible,
  requestProject,
} from "@/components/projects/project-mutation-utils";
import type {
  WorkflowSubjectAction,
  WorkflowSubjectState,
  WorkflowSubjectTimelineItem,
  WorkflowSubjectTimelineResponse,
} from "@/components/workflows/workflow-subject-state-panel";
import { resolveProjectWorkflowActionTransition } from "@/components/workflows/workflow-business-actions";
import { requestBackendJson } from "@/lib/backend-client";

const PROJECT_WORKFLOW_EFFECT_BY_NODE_KEY: Partial<Record<string, ProjectStatusAction>> = {
  designing: "confirm_proposal",
  proposal_confirmed: "sign_contract",
  signed: "finalize_design",
  design_finalized: "schedule_construction",
  pending_start: "start_project",
  started: "start_construction",
  constructing: "start_acceptance",
  on_hold: "resume_project",
};

export function useProjectStatusPanel(
  project: ProjectRecord,
  onChanged: () => Promise<void>,
) {
  const [constructionStages, setConstructionStages] =
    useState<ProjectConstructionStagesResponse | null>(null);
  const [transitions, setTransitions] = useState<WorkflowSubjectTimelineItem[]>([]);
  const [constructionStagesLoading, setConstructionStagesLoading] = useState(false);
  const [transitionsLoading, setTransitionsLoading] = useState(false);
  const [transitionsLoaded, setTransitionsLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedAction, setSelectedAction] = useState<ProjectStatusActionItem | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowSubjectState | null>(null);
  const [reason, setReason] = useState("");
  const [signedAmount, setSignedAmount] = useState("");
  const [constructionStartDate, setConstructionStartDate] = useState("");
  const [constructionManagerKeyword, setConstructionManagerKeyword] = useState("");
  const [constructionManagerCandidates, setConstructionManagerCandidates] = useState<EmployeeOption[]>([]);
  const [constructionManagerEmployeeId, setConstructionManagerEmployeeId] = useState("");
  const [constructionManagerLoading, setConstructionManagerLoading] = useState(false);

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
      requestBackendJson<WorkflowSubjectTimelineResponse>(
        `/workflow-subjects/project/${project.id}/timeline?page=1&pageSize=3`,
        { cache: "no-store", fallbackMessage: "流程时间线加载失败" },
      )
        .then((timeline) => {
          if (cancelled) return;
          setTransitions(timeline.list || []);
          setTransitionsLoaded(true);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "流程时间线加载失败");
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

  const currentStatus = project.status;
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
        const output = {
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
          payment_status: selectedAction.workflow_business_domain === "payment_collection"
            ? "success"
            : undefined,
        };
        if (selectedAction.workflow_task_id) {
          await requestProject({
            path: `/workflow-tasks/${selectedAction.workflow_task_id}/complete`,
            method: "POST",
            payload: {
              action: selectedAction.workflow_action_key || "complete",
              reason: normalizedReason || null,
              output,
            },
          });
        } else {
          throw new Error("缺少可执行的 workflow 待办");
        }
        resetActionDialog();
        await onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "状态变更失败");
      }
    });
  }

  const workflowActions = (workflowState?.actions || [])
    .map((action) =>
      mapProjectWorkflowAction(
        action,
        currentStatus,
        typeof project.paused_from_status === "string" ? project.paused_from_status : null,
      )
    )
    .filter((action): action is ProjectStatusActionItem => Boolean(action));
  const actions = workflowActions;
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
    actionsLoading: false,
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
    setWorkflowState,
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

function mapProjectWorkflowAction(
  action: WorkflowSubjectAction,
  currentStatus: string | null | undefined,
  pausedFromStatus: string | null,
): ProjectStatusActionItem | null {
  if (action.disabled || !action.task_id) {
    return null;
  }

  if (action.business_domain === "payment_collection") {
    return {
      action: "confirm_payment",
      label: action.label,
      from_status: isProjectStatus(currentStatus) ? currentStatus : "constructing",
      to_status: "收款确认",
      requires_reason: action.requires_reason,
      workflow_action_key: action.key,
      workflow_task_id: action.task_id,
      workflow_business_domain: action.business_domain,
      workflow_node_key: action.node_key,
      workflow_node_type: action.node_type,
      workflow_output_fields: action.output_fields,
    };
  }

  if (action.business_domain !== "workflow_project" || !isProjectStatus(currentStatus)) {
    return null;
  }

  const projectAction = PROJECT_WORKFLOW_EFFECT_BY_NODE_KEY[action.node_key] ??
    (action.business_action && isProjectStatusAction(action.business_action)
      ? action.business_action
      : null);
  if (!projectAction) {
    return null;
  }

  const transition = resolveProjectWorkflowActionTransition({
    action: projectAction,
    fromStatus: currentStatus,
    pausedFromStatus: isProjectStatus(pausedFromStatus) ? pausedFromStatus : null,
  });
  if (!transition && projectAction !== "resume_project") return null;

  return {
    action: projectAction,
    label: action.label,
    from_status: transition?.fromStatus ?? currentStatus,
    to_status: transition?.toStatus ?? "恢复后状态",
    requires_reason: action.requires_reason,
    workflow_action_key: action.key,
    workflow_task_id: action.task_id,
    workflow_business_domain: action.business_domain,
    workflow_node_key: action.node_key,
    workflow_node_type: action.node_type,
    workflow_output_fields: action.output_fields,
  };
}
