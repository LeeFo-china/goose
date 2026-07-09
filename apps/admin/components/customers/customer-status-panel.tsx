"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, History, Loader2 } from "lucide-react";
import {
  isCustomerStatus,
  isCustomerStatusAction,
} from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerRecord, CustomerStatusActionItem } from "@/components/customers/customer-mutation-types";
import { customerStatusBadgeVariant, customerStatusLabel, formatDateTime, formatPropertySummary, getPrimaryCustomerProperty, requestCustomer } from "@/components/customers/customer-mutation-shared";
import { DesignProjectBeforeStatusDialog } from "@/components/customers/design-project-before-status-dialog";
import {
  workflowActionDisplayLabel,
  workflowActionLabel,
  workflowInstanceStatusLabel,
  workflowNodeTitle,
  workflowSubjectTypeLabel,
  workflowTransitionNodeLabel,
} from "@/components/workflows/workflow-display-labels";
import {
  WorkflowSubjectStatePanel,
  type WorkflowSubjectAction,
  type WorkflowSubjectState,
  type WorkflowSubjectTimelineItem,
  type WorkflowSubjectTimelineResponse,
} from "@/components/workflows/workflow-subject-state-panel";
import { resolveCustomerWorkflowActionTransition } from "@/components/workflows/workflow-business-actions";

type CustomerPanelActionItem = CustomerStatusActionItem & {
  workflow_action_key?: string;
  workflow_task_id?: string;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getWorkflowLogReason(item: WorkflowSubjectTimelineItem) {
  return optionalString(item.context?.reason) ||
    optionalString(item.context?.comment) ||
    optionalString(item.context?.rejected_reason);
}

export function CustomerStatusPanel({
  customer,
  onChanged,
}: {
  customer: CustomerRecord;
  onChanged: () => Promise<void>;
}) {
  const [transitions, setTransitions] = useState<WorkflowSubjectTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedAction, setSelectedAction] = useState<CustomerPanelActionItem | null>(null);
  const [designAction, setDesignAction] = useState<CustomerPanelActionItem | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowSubjectState | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    requestCustomer<WorkflowSubjectTimelineResponse>({
      path: `/workflow-subjects/customer/${customer.id}/timeline?page=1&pageSize=20`,
    })
      .then((timeline) => {
        if (cancelled) return;
        setTransitions(timeline.list || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "流程时间线加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  function closeActionDialog() {
    if (pending) return;
    setSelectedAction(null);
    setReason("");
  }

  async function executeStatusAction(action: CustomerPanelActionItem, inputReason?: string) {
    const normalizedReason = (inputReason ?? "").trim();
    if (action.requires_reason && !normalizedReason) {
      setError("该状态动作必须填写原因");
      return;
    }

    if (action.workflow_task_id) {
      await requestCustomer({
        path: `/workflow-tasks/${action.workflow_task_id}/complete`,
        method: "POST",
        payload: {
          action: action.workflow_action_key || "complete",
          reason: normalizedReason || null,
          output: {},
        },
      });
      return;
    }

    throw new Error("缺少可执行的流程待办");
  }

  function submitAction() {
    if (!selectedAction) return;
    setError("");
    startTransition(async () => {
      try {
        await executeStatusAction(selectedAction, reason);
        setSelectedAction(null);
        setReason("");
        await onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "状态变更失败");
      }
    });
  }

  const currentStatus = customer.status;
  const workflowActions = (workflowState?.actions || [])
    .map((action) => mapCustomerWorkflowAction(action, currentStatus))
    .filter((action): action is CustomerPanelActionItem => Boolean(action));
  const actions = workflowActions;
  const primaryProperty = getPrimaryCustomerProperty(customer);
  const propertyName = formatPropertySummary(primaryProperty) ||
    [customer.community, customer.building_info].filter(Boolean).join(" ");
  const workflowNodeLabel = workflowNodeTitle({
    nodeKey: workflowState?.current_node_key,
    nodeTitle: workflowState?.current_node_title,
  });
  const workflowNodeLabelMap = new Map(
    (workflowState?.timeline_nodes || []).map((node) => [
      node.node_key,
      workflowNodeTitle({
        displayLabel: node.display?.label,
        nodeKey: node.node_key,
        nodeTitle: node.node_title,
        title: node.title,
      }),
    ]),
  );

  return (
    <section className="rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold">状态流转</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={customerStatusBadgeVariant(currentStatus)}>
              {customerStatusLabel(currentStatus)}
            </Badge>
            {loading ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在加载
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.action}
              type="button"
              size="sm"
              variant={action.action === "mark_invalid" ? "destructive" : "outline"}
              disabled={loading || pending}
              onClick={() => {
                setError("");
                if (action.action === "start_design") {
                  setDesignAction(action);
                  return;
                }
                setSelectedAction(action);
              }}
            >
              {action.label}
            </Button>
          ))}
          {!loading && actions.length === 0 ? (
            <Badge variant="outline">暂无可执行动作</Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-4 rounded-md border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">客户主流程</Badge>
            <span className="text-sm font-medium">已接入客户状态流转</span>
          </div>
          {workflowState ? (
            <Badge variant={workflowState.instance_status === "failed" ? "danger" : "outline"}>
              {workflowInstanceStatusLabel(workflowState.instance_status)}
            </Badge>
          ) : (
            <Badge variant="outline">未启动</Badge>
          )}
        </div>
        {workflowState ? (
          <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div>
              <span className="text-foreground">对象：</span>
              {workflowSubjectTypeLabel(workflowState.subject_type)}
            </div>
            <div>
              <span className="text-foreground">当前节点：</span>
              {workflowNodeLabel || "-"}
            </div>
            <div>
              <span className="text-foreground">实例：</span>
              {workflowState.instance_id ? workflowState.instance_id.slice(0, 8) : "-"}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            暂无流程运行时投影，等待流程状态同步。
          </p>
        )}
      </div>
      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}
      <div className="mt-4">
        <WorkflowSubjectStatePanel
          subjectType="customer"
          subjectId={customer.id}
          onStateChange={setWorkflowState}
        />
      </div>
      <div className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History />
            状态时间线
          </div>
          <Badge variant="outline">最近 20 条</Badge>
        </div>
        {transitions.length > 0 ? (
          <div className="relative ml-3 flex flex-col gap-3 border-l pl-5">
            {transitions.map((item) => (
              <div key={item.id} className="relative rounded-md border bg-background p-3">
                <span className="absolute -left-[27px] top-4 flex size-4 rounded-full border-2 border-background bg-primary" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Badge variant="outline">
                      {workflowTransitionNodeLabel(item.source_node_key, workflowNodeLabelMap, "开始")}
                    </Badge>
                    <ArrowRight />
                    <Badge variant="outline">
                      {workflowTransitionNodeLabel(item.target_node_key, workflowNodeLabelMap, "结束")}
                    </Badge>
                    <span>{workflowActionLabel(item.action)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
                {getWorkflowLogReason(item) ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {getWorkflowLogReason(item)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            暂无状态流转记录。
          </div>
        )}
      </div>
      <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => !open && closeActionDialog()}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{selectedAction?.label || "状态变更"}</DialogTitle>
            <DialogDescription>
              {selectedAction
                ? `${customerStatusLabel(selectedAction.from_status)} -> ${customerStatusLabel(selectedAction.to_status)}`
                : "确认执行该状态动作。"}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="customer-status-reason">
              {selectedAction?.requires_reason ? "原因" : "备注"}
            </FieldLabel>
            <Textarea
              id="customer-status-reason"
              value={reason}
              disabled={pending}
              placeholder={selectedAction?.requires_reason ? "请输入原因" : "可选"}
              className="min-h-[96px]"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={closeActionDialog}>
              取消
            </Button>
            <Button
              type="button"
              variant={selectedAction?.action === "mark_invalid" ? "destructive" : "default"}
              disabled={pending}
              onClick={submitAction}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认执行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DesignProjectBeforeStatusDialog
        open={Boolean(designAction)}
        customer={customer}
        propertyName={propertyName}
        pendingStatus={pending}
        onOpenChange={(open) => {
          if (!open && !pending) setDesignAction(null);
        }}
        onProjectCreated={async () => {
          if (!designAction) return;
          await executeStatusAction(designAction);
          setDesignAction(null);
          await onChanged();
        }}
      />
    </section>
  );
}

function mapCustomerWorkflowAction(
  action: WorkflowSubjectAction,
  currentStatus: string | null | undefined,
): CustomerPanelActionItem | null {
  if (
    action.business_domain !== "customer_status" ||
    !action.business_action ||
    !isCustomerStatusAction(action.business_action) ||
    !isCustomerStatus(currentStatus)
  ) {
    return null;
  }

  const transition = resolveCustomerWorkflowActionTransition({
    action: action.business_action,
    fromStatus: currentStatus,
  });
  if (!transition) return null;

  return {
    action: action.business_action,
    label: workflowActionDisplayLabel(action.label, action.business_action),
    from_status: transition.fromStatus,
    to_status: transition.toStatus,
    requires_reason: action.requires_reason,
    workflow_action_key: action.key,
    workflow_task_id: action.task_id,
  };
}
