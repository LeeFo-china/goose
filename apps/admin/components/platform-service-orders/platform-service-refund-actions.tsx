"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

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

import type { PlatformServiceRefundRequestListItem } from "./platform-service-order-types";

export function PlatformServiceRefundActions({
  request,
  canReview,
}: {
  request: PlatformServiceRefundRequestListItem;
  canReview: boolean;
}) {
  if (!canReview || request.status !== "reviewing") return null;

  return (
    <div className="flex justify-end gap-2">
      <ReviewRefundButton request={request} decision="rejected" />
      <ReviewRefundButton request={request} decision="approved" />
    </div>
  );
}

function ReviewRefundButton({
  request,
  decision,
}: {
  request: PlatformServiceRefundRequestListItem;
  decision: "approved" | "rejected";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const isApproved = decision === "approved";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const reviewRemark = String(formData.get("review_remark") || "").trim();

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/api/backend/platform/billing/service-refund-requests/${request.id}/review`,
          {
            method: "POST",
            body: JSON.stringify({
              decision,
              expected_version: request.version ?? 1,
              review_remark: reviewRemark || undefined,
            }),
            fallbackMessage: "审核退款失败",
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "审核退款失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={isApproved ? "default" : "outline"}
        >
          {isApproved ? (
            <CheckCircle2 data-icon="inline-start" />
          ) : (
            <XCircle data-icon="inline-start" />
          )}
          {isApproved ? "审核退款" : "驳回"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isApproved ? "通过退款审核" : "驳回退款申请"}</DialogTitle>
          <DialogDescription>{request.order?.order_no || request.service_order_id}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`review-remark-${request.id}`}>审核备注</FieldLabel>
              <Textarea
                id={`review-remark-${request.id}`}
                name="review_remark"
                maxLength={1000}
                placeholder={isApproved ? "填写退款审核依据" : "填写驳回原因"}
              />
            </Field>
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending} variant={isApproved ? "default" : "destructive"}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {isApproved ? "确认通过" : "确认驳回"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

