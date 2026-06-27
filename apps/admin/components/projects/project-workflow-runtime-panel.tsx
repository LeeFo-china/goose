"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, RefreshCw, Workflow } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectStatusActionDialog } from "@/components/projects/project-status-action-dialog";
import type { ProjectRecord, ProjectStatusActionItem } from "@/components/projects/project-mutation-types";
import type { WorkflowSubjectAction, WorkflowSubjectState, WorkflowSubjectTimelineItem, WorkflowSubjectTimelineResponse } from "@/components/workflows/workflow-subject-state-panel";
import { requestBackendJson } from "@/lib/backend-client";
import {
  buildActionOutput,
  buildNodeInsight,
  createActionOutputDefaults,
  dedupeActions,
  findCurrentNode,
  getActionDisabledReason,
  getMissingRequiredActionOutputLabel,
  mapWorkflowAction,
  nodeStatusLabel,
  nodeStatusVariant,
  timelineNodeAttributes,
  timelineNodeTitle,
  WorkflowRuntimeSummary,
  WorkflowTimeline,
  WorkflowTransitionList,
} from "@/components/projects/project-workflow-runtime-view";

type WorkflowStateResponse = {
  workflow_state: WorkflowSubjectState | null;
};

export function ProjectWorkflowRuntimePanel({
  active = true,
  compact = false,
  onChanged,
  project,
}: {
  active?: boolean;
  compact?: boolean;
  onChanged?: () => Promise<void>;
  project: ProjectRecord;
}) {
  const [state, setState] = useState<WorkflowSubjectState | null>(null);
  const [transitions, setTransitions] = useState<WorkflowSubjectTimelineItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selectedAction, setSelectedAction] = useState<ProjectStatusActionItem | null>(null);
  const [reason, setReason] = useState("");
  const [actionOutputValues, setActionOutputValues] = useState<Record<string, string>>({});
  const [refreshing, startRefreshTransition] = useTransition();
  const [submitting, startSubmitTransition] = useTransition();

  const timelineNodes = state?.timeline_nodes || [];
  const currentNode = useMemo(() => {
    return findCurrentNode(timelineNodes, state?.current_node_key);
  }, [state?.current_node_key, timelineNodes]);
  const currentActions = useMemo(() => {
    return dedupeActions([...(currentNode?.actions || []), ...(state?.actions || [])]);
  }, [currentNode?.actions, state?.actions]);
  const executableActions = currentActions.filter((action) => !getActionDisabledReason(action));
  const currentNodeAttributes = currentNode ? timelineNodeAttributes(currentNode) : [];
  const currentNodeInsight = currentNode ? buildNodeInsight(currentNode) : "";

  async function refreshRuntime() {
    const stateData = await requestBackendJson<WorkflowStateResponse>(
      `/workflow-subjects/project/${project.id}/state`,
      { cache: "no-store", fallbackMessage: "项目流程状态加载失败" },
    );
    setState(stateData.workflow_state ?? null);
    setLoaded(true);
    if (compact) {
      setTransitions([]);
      return;
    }

    void requestBackendJson<WorkflowSubjectTimelineResponse>(
      `/workflow-subjects/project/${project.id}/timeline?page=1&pageSize=5`,
      { cache: "no-store", fallbackMessage: "项目流程时间线加载失败" },
    )
      .then((timeline) => setTransitions(timeline.list || []))
      .catch((err) => {
        setTransitions([]);
        setError(err instanceof Error ? err.message : "项目流程时间线加载失败");
      });
  }

  function loadRuntime() {
    startRefreshTransition(async () => {
      try {
        setError("");
        await refreshRuntime();
      } catch (err) {
        setError(err instanceof Error ? err.message : "项目流程加载失败");
        setLoaded(true);
      }
    });
  }

  function closeActionDialog() {
    if (submitting) return;
    setSelectedAction(null);
    setReason("");
    setActionOutputValues({});
  }

  function openActionDialog(action: WorkflowSubjectAction) {
    const disabledReason = getActionDisabledReason(action);
    if (disabledReason) {
      setError(disabledReason);
      return;
    }
    setError("");
    setReason("");
    const mappedAction = mapWorkflowAction(action, project.status);
    setActionOutputValues(createActionOutputDefaults(mappedAction));
    setSelectedAction(mappedAction);
  }

  function submitAction() {
    if (!selectedAction?.workflow_task_id) return;
    const normalizedReason = reason.trim();
    if (selectedAction.requires_reason && !normalizedReason) {
      setError("该流程动作必须填写原因");
      return;
    }
    const missingOutputLabel = getMissingRequiredActionOutputLabel(
      selectedAction,
      actionOutputValues,
    );
    if (missingOutputLabel) {
      setError(`请填写${missingOutputLabel}`);
      return;
    }

    startSubmitTransition(async () => {
      try {
        setError("");
        await requestBackendJson(`/workflow-tasks/${selectedAction.workflow_task_id}/complete`, {
          method: "POST",
          body: JSON.stringify({
            action: selectedAction.workflow_action_key || "complete",
            reason: normalizedReason || null,
            output: buildActionOutput(selectedAction, actionOutputValues),
          }),
          fallbackMessage: "流程动作执行失败",
        });
        closeActionDialog();
        await onChanged?.();
        await refreshRuntime();
      } catch (err) {
        setError(err instanceof Error ? err.message : "流程动作执行失败");
      }
    });
  }

  useEffect(() => {
    if (!active) return;
    loadRuntime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, project.id]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
              <Workflow className="size-4" />
            </span>
            <div className="min-w-0">
              <CardTitle>流程管理</CardTitle>
              {!compact ? (
                <CardDescription className="mt-2">
                  以项目运行态为准展示节点、属性和动作；施工阶段明细不参与推导当前节点。
                </CardDescription>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={loadRuntime}
            disabled={refreshing || submitting}
            aria-label="刷新项目流程"
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
          </Button>
        </div>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5">
        {!loaded && refreshing ? (
          <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline size-4 animate-spin" />
            流程加载中
          </div>
        ) : !state ? (
          <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
            当前项目暂无流程运行数据。
          </div>
        ) : (
          <>
            {!compact ? (
              <WorkflowRuntimeSummary
                actionCount={currentActions.length}
                executableActionCount={executableActions.length}
                state={state}
              />
            ) : null}
            <section className="rounded-md border bg-background p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <CurrentNodeSummary
                  currentNode={currentNode}
                  currentNodeAttributes={currentNodeAttributes}
                  currentNodeInsight={currentNodeInsight}
                  state={state}
                />
                <CurrentNodeActions
                  actions={currentActions}
                  refreshing={refreshing}
                  selectedAction={selectedAction}
                  submitting={submitting}
                  onOpenAction={openActionDialog}
                />
              </div>
            </section>
            {!compact ? (
              <>
                <WorkflowTimeline nodes={timelineNodes} />
                <WorkflowTransitionList nodes={timelineNodes} transitions={transitions} />
              </>
            ) : null}
          </>
        )}
      </CardContent>
      <ProjectStatusActionDialog
        projectId={project.id}
        selectedAction={selectedAction}
        pending={submitting}
        reason={reason}
        setReason={setReason}
        outputValues={actionOutputValues}
        setOutputValues={setActionOutputValues}
        closeActionDialog={closeActionDialog}
        submitAction={submitAction}
      />
    </Card>
  );
}

function CurrentNodeSummary({
  currentNode,
  currentNodeAttributes,
  currentNodeInsight,
  state,
}: {
  currentNode: ReturnType<typeof findCurrentNode>;
  currentNodeAttributes: ReturnType<typeof timelineNodeAttributes>;
  currentNodeInsight: string;
  state: WorkflowSubjectState;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default">当前节点</Badge>
        {currentNode ? (
          <Badge variant={nodeStatusVariant(currentNode)}>{nodeStatusLabel(currentNode)}</Badge>
        ) : null}
      </div>
      <h3 className="mt-3 truncate text-lg font-semibold tracking-normal">
        {currentNode ? timelineNodeTitle(currentNode) : state.current_node_title || "-"}
      </h3>
      <div className="mt-1 break-all text-xs text-muted-foreground">
        {currentNode ? "节点来自流程运行数据" : "未定位当前节点"}
      </div>
      {currentNodeInsight ? (
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{currentNodeInsight}</p>
      ) : null}
      {currentNodeAttributes.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {currentNodeAttributes.map((item) => (
            <Badge key={item.key} variant="outline">{item.label}: {item.value}</Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CurrentNodeActions({
  actions,
  onOpenAction,
  refreshing,
  selectedAction,
  submitting,
}: {
  actions: WorkflowSubjectAction[];
  onOpenAction: (action: WorkflowSubjectAction) => void;
  refreshing: boolean;
  selectedAction: ProjectStatusActionItem | null;
  submitting: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2 lg:w-[280px]">
      <div className="text-xs font-medium text-muted-foreground">可执行动作</div>
      {actions.length > 0 ? (
        <div className="flex flex-col gap-2">
          {actions.map((action) => {
            const disabledReason = getActionDisabledReason(action);
            return (
              <div key={`${action.task_id || "no-task"}-${action.key}`} className="flex flex-col gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={Boolean(disabledReason) || refreshing || submitting}
                  className="justify-start"
                  onClick={() => onOpenAction(action)}
                >
                  {submitting && selectedAction?.workflow_task_id === action.task_id ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : null}
                  {action.label || "执行动作"}
                </Button>
                {disabledReason ? (
                  <div className="text-xs text-muted-foreground">{disabledReason}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          当前账号暂无可执行动作。
        </div>
      )}
    </div>
  );
}
