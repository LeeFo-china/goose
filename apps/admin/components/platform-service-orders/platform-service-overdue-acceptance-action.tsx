"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

import { formatDateTime } from "./platform-service-order-rules";
import type { PlatformServiceWorkOrderListItem } from "./platform-service-order-types";

const DEFAULT_OVERDUE_ACCEPTANCE_REMARK =
  "客户超过验收确认期未处理，平台根据履约记录、交付附件和验收准备材料确认验收。";

export function PlatformServiceOverdueAcceptanceAction({
  workOrder,
}: {
  workOrder: PlatformServiceWorkOrderListItem;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const action = workOrder.available_actions?.confirm_overdue_acceptance;
  const canConfirm = action?.enabled ?? false;
  const disabledReason = action?.disabled_reason ?? "客户验收未逾期，不能由平台确认验收";
  const dueAt = workOrder.acceptance_preparation?.acceptance_due_at ?? null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const remark = String(formData.get("remark") || "").trim();
    if (!remark) {
      setError("请填写平台确认原因");
      return;
    }

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/api/backend/platform/billing/service-work-orders/${workOrder.id}/overdue-acceptance/confirm`,
          {
            method: "POST",
            body: JSON.stringify({
              expected_version: workOrder.version ?? 1,
              remark,
            }),
            fallbackMessage: "平台确认验收失败",
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "平台确认验收失败");
      }
    });
  }

  return (
    <Dialog open={canConfirm ? open : false} onOpenChange={(nextOpen) => {
      if (canConfirm) setOpen(nextOpen);
    }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canConfirm}
          title={disabledReason}
        >
          <FileCheck2 data-icon="inline-start" />
          平台确认验收
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>平台确认验收</DialogTitle>
          <DialogDescription>
            {workOrder.order_no}
            {dueAt ? ` · 客户确认截止：${formatDateTime(dueAt)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`overdue-acceptance-remark-${workOrder.id}`}>
                确认原因
              </FieldLabel>
              <Textarea
                id={`overdue-acceptance-remark-${workOrder.id}`}
                name="remark"
                defaultValue={DEFAULT_OVERDUE_ACCEPTANCE_REMARK}
                maxLength={1000}
                required
              />
            </Field>
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认验收
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
