"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, History, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerRecord, CustomerStatusActionsResponse, CustomerStatusActionItem, CustomerStatusTransitionRecord } from "@/components/customers/customer-mutation-types";
import { customerActionLabel, customerStatusBadgeVariant, customerStatusLabel, formatDateTime, formatPropertySummary, getPrimaryCustomerProperty, requestCustomer } from "@/components/customers/customer-mutation-shared";
import { DesignProjectBeforeStatusDialog } from "@/components/customers/design-project-before-status-dialog";

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
  const [designAction, setDesignAction] = useState<CustomerStatusActionItem | null>(null);
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

  async function executeStatusAction(action: CustomerStatusActionItem, inputReason?: string) {
    const normalizedReason = (inputReason ?? "").trim();
    if (action.requires_reason && !normalizedReason) {
      setError("该状态动作必须填写原因");
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
  const actions = actionsData?.actions || [];
  const primaryProperty = getPrimaryCustomerProperty(customer);
  const propertyName = formatPropertySummary(primaryProperty) ||
    [customer.community, customer.building_info].filter(Boolean).join(" ");

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
      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}
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
