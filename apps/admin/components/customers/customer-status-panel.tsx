"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, History, Loader2 } from "lucide-react";
import {
  isCustomerStatus,
  isCustomerStatusAction,
  resolveCustomerStatusTransition,
} from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { BadgeVariant, CustomerRecord, CustomerStatusActionsResponse, CustomerStatusActionItem, CustomerStatusTransitionRecord } from "@/components/customers/customer-mutation-types";
import { customerActionLabel, customerStatusBadgeVariant, customerStatusLabel, formatDateTime, formatPropertySummary, getPrimaryCustomerProperty, requestCustomer } from "@/components/customers/customer-mutation-shared";
import { DesignProjectBeforeStatusDialog } from "@/components/customers/design-project-before-status-dialog";
import {
  WorkflowSubjectStatePanel,
  type WorkflowSubjectAction,
  type WorkflowSubjectState,
} from "@/components/workflows/workflow-subject-state-panel";

type CustomerPanelActionItem = CustomerStatusActionItem & {
  workflow_action_key?: string;
  workflow_task_id?: string;
};

type CustomerWorkflowRuntimeMetadata = {
  status: string;
  workflow_key?: string;
  instance_id?: string;
  node_key?: string;
  current_node_key?: string | null;
  next_node_key?: string | null;
  reason?: string;
  error_message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getWorkflowRuntimeMetadata(
  transition: CustomerStatusTransitionRecord,
): CustomerWorkflowRuntimeMetadata | null {
  const runtime = transition.metadata?.workflow_runtime;
  if (!isRecord(runtime)) return null;

  const status = optionalString(runtime.status);
  if (!status) return null;

  return {
    status,
    workflow_key: optionalString(runtime.workflow_key),
    instance_id: optionalString(runtime.instance_id),
    node_key: optionalString(runtime.node_key),
    current_node_key: optionalString(runtime.current_node_key) ?? null,
    next_node_key: optionalString(runtime.next_node_key) ?? null,
    reason: optionalString(runtime.reason),
    error_message: optionalString(runtime.error_message),
  };
}

function getLatestWorkflowRuntimeMetadata(
  transitions: CustomerStatusTransitionRecord[],
): CustomerWorkflowRuntimeMetadata | null {
  for (const transition of transitions) {
    const runtime = getWorkflowRuntimeMetadata(transition);
    if (runtime) return runtime;
  }
  return null;
}

function workflowRuntimeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    started: "已启动",
    advanced: "已推进",
    skipped: "未接入",
    failed: "同步失败",
  };
  return labels[status] || status;
}

function workflowRuntimeStatusVariant(status: string): BadgeVariant {
  if (status === "started" || status === "advanced") return "success";
  if (status === "failed") return "danger";
  if (status === "skipped") return "warning";
  return "outline";
}

export function CustomerStatusPanel({
  customer,
  initialActionsData,
  initialTransitions,
  onChanged,
}: {
  customer: CustomerRecord;
  initialActionsData?: CustomerStatusActionsResponse | null;
  initialTransitions?: CustomerStatusTransitionRecord[];
  onChanged: () => Promise<void>;
}) {
  const [actionsData, setActionsData] = useState<CustomerStatusActionsResponse | null>(
    initialActionsData ?? null,
  );
  const [transitions, setTransitions] = useState<CustomerStatusTransitionRecord[]>(
    initialTransitions ?? [],
  );
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedAction, setSelectedAction] = useState<CustomerStatusActionItem | null>(null);
  const [designAction, setDesignAction] = useState<CustomerPanelActionItem | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowSubjectState | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (initialActionsData || initialTransitions) {
      setActionsData(initialActionsData ?? null);
      setTransitions(initialTransitions ?? []);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      requestCustomer({ path: `/customers/${customer.id}/status-actions` }),
      requestCustomer({ path: `/customers/${customer.id}/status-transitions?page=1&pageSize=20` }),
    ])
      .then(([actions, timeline]) => {
        if (cancelled) return;
        setActionsData(actions as CustomerStatusActionsResponse);
        setTransitions((timeline?.rows || []) as CustomerStatusTransitionRecord[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "状态信息加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customer.id, customer.status, initialActionsData, initialTransitions]);

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

    await requestCustomer({
      path: `/customers/${customer.id}/status-transition`,
      method: "POST",
      payload: {
        action: action.action,
        reason: normalizedReason || undefined,
        metadata: {
          source: "admin",
          ...(action.action === "start_design"
            ? { project_created_before_start_design: true }
            : {}),
        },
      },
    });
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

  const currentStatus = actionsData?.current_status || customer.status;
  const workflowActions = (workflowState?.actions || [])
    .map((action) => mapCustomerWorkflowAction(action, currentStatus))
    .filter((action): action is CustomerPanelActionItem => Boolean(action));
  const actions = workflowActions.length > 0 ? workflowActions : actionsData?.actions || [];
  const primaryProperty = getPrimaryCustomerProperty(customer);
  const propertyName = formatPropertySummary(primaryProperty) ||
    [customer.community, customer.building_info].filter(Boolean).join(" ");
  const workflowRuntime = getLatestWorkflowRuntimeMetadata(transitions);
  const workflowNodeKey = workflowRuntime?.current_node_key ||
    workflowRuntime?.next_node_key ||
    workflowRuntime?.node_key ||
    null;

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
          {workflowRuntime ? (
            <Badge variant={workflowRuntimeStatusVariant(workflowRuntime.status)}>
              {workflowRuntimeStatusLabel(workflowRuntime.status)}
            </Badge>
          ) : (
            <Badge variant="outline">等待首次动作</Badge>
          )}
        </div>
        {workflowRuntime ? (
          <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div>
              <span className="text-foreground">流程编码：</span>
              {workflowRuntime.workflow_key || "customer_main"}
            </div>
            <div>
              <span className="text-foreground">当前节点：</span>
              {workflowNodeKey || "-"}
            </div>
            <div>
              <span className="text-foreground">实例：</span>
              {workflowRuntime.instance_id ? workflowRuntime.instance_id.slice(0, 8) : "-"}
            </div>
            {workflowRuntime.reason || workflowRuntime.error_message ? (
              <div className="sm:col-span-3">
                <span className="text-foreground">说明：</span>
                {workflowRuntime.error_message || workflowRuntime.reason}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            执行“开始跟进”会自动启动 customer_main，后续到店、设计、签约动作会推进对应节点。
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
                    <Badge variant={customerStatusBadgeVariant(item.from_status)}>
                      {customerStatusLabel(item.from_status)}
                    </Badge>
                    <ArrowRight />
                    <Badge variant={customerStatusBadgeVariant(item.to_status)}>
                      {customerStatusLabel(item.to_status)}
                    </Badge>
                    <span>{customerActionLabel(item.action)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
                {item.reason ? (
                  <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
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

  const transition = resolveCustomerStatusTransition({
    action: action.business_action,
    fromStatus: currentStatus,
  });
  if (!transition) return null;

  return {
    action: action.business_action,
    label: action.label,
    from_status: transition.fromStatus,
    to_status: transition.toStatus,
    requires_reason: action.requires_reason,
    workflow_action_key: action.key,
    workflow_task_id: action.task_id,
  };
}
