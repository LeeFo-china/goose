"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  ProjectRecord,
  ProjectStatusActionItem,
} from "@/components/projects/project-mutation-types";
import {
  buildProjectActionViews,
  formatMoney,
  requestProject,
} from "@/components/projects/project-mutation-utils";
import type {
  WorkflowSubjectAction,
  WorkflowSubjectState,
  WorkflowSubjectTimelineItem,
  WorkflowSubjectTimelineResponse,
} from "@/components/workflows/workflow-subject-state-panel";
import { requestBackendJson } from "@/lib/backend-client";

export function useProjectStatusPanel(
  project: ProjectRecord,
  onChanged: () => Promise<void>,
) {
  const [transitions, setTransitions] = useState<WorkflowSubjectTimelineItem[]>([]);
  const [transitionsLoading, setTransitionsLoading] = useState(false);
  const [transitionsLoaded, setTransitionsLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedAction, setSelectedAction] = useState<ProjectStatusActionItem | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowSubjectState | null>(null);
  const [reason, setReason] = useState("");

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

  function resetActionDialog() {
    setSelectedAction(null);
    setReason("");
  }

  function closeActionDialog() {
    if (pending) return;
    resetActionDialog();
  }

  function openActionDialog(action: ProjectStatusActionItem) {
    setError("");
    setSelectedAction(action);
    setReason("");
  }

  function submitAction() {
    if (!selectedAction) return;
    const normalizedReason = reason.trim();
    if (selectedAction.requires_reason && !normalizedReason) {
      setError("该状态动作必须填写原因");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        const output = {
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
    .map((action) => mapProjectWorkflowAction(action, currentStatus))
    .filter((action): action is ProjectStatusActionItem => Boolean(action));
  const actions = workflowActions;
  const actionViews = buildProjectActionViews(actions);
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
    constructionStagesLoading: false,
    currentStatus,
    error,
    latestTransitions,
    openActionDialog,
    pending,
    reason,
    selectedAction,
    setWorkflowState,
    setReason,
    startAcceptanceBlockedReason: "",
    submitAction,
    transitions,
    transitionsLoaded,
    transitionsLoading,
  };
}

function mapProjectWorkflowAction(
  action: WorkflowSubjectAction,
  currentStatus: string | null | undefined,
): ProjectStatusActionItem | null {
  if (action.disabled || !action.task_id) {
    return null;
  }

  return {
    action: action.key || action.task_id,
    label: action.label,
    from_status: currentStatus || "-",
    to_status: action.node_key || action.node_type || "-",
    requires_reason: action.requires_reason,
    workflow_action_key: action.key,
    workflow_task_id: action.task_id,
    workflow_business_domain: action.business_domain,
    workflow_node_key: action.node_key,
    workflow_node_type: action.node_type,
    workflow_output_fields: action.output_fields,
  };
}
