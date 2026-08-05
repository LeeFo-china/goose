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

import {
  PlatformServiceFulfillmentAttachmentUploadField,
  type UploadedFulfillmentAttachment,
} from "./platform-service-fulfillment-attachment-upload-field";
import type { PlatformServiceWorkOrderListItem } from "./platform-service-order-types";

const DEFAULT_ACCEPTANCE_SUMMARY =
  "客户专属系统环境已部署，服务器配置及首次操作培训已完成。请核对履约记录与附件后确认验收。";

export function PlatformServiceAcceptancePreparationAction({
  workOrder,
}: {
  workOrder: PlatformServiceWorkOrderListItem;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<
    UploadedFulfillmentAttachment[]
  >([]);
  const [error, setError] = useState("");
  const hasSubmittedAcceptance =
    workOrder.acceptance_preparation?.status === "submitted" ||
    workOrder.acceptance_preparation?.status === "accepted";
  const canSubmit =
    workOrder.status === "awaiting_acceptance" && !hasSubmittedAcceptance;
  const disabledReason = hasSubmittedAcceptance
    ? "验收准备已提交，等待客户确认验收"
    : workOrder.status === "awaiting_acceptance"
      ? undefined
      : "工单推进到待验收后才能提交客户验收";

  function resetFormState() {
    setError("");
    setUploadedAttachments([]);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen && (pending || uploading)) return;
    setOpen(nextOpen);
    if (!nextOpen) resetFormState();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const summary = String(formData.get("summary") || "").trim();
    const fileIds = uploadedAttachments.map((attachment) => attachment.fileId);
    if (!summary) {
      setError("请填写验收摘要");
      return;
    }

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/api/backend/platform/billing/service-work-orders/${workOrder.id}/acceptance-preparation`,
          {
            method: "POST",
            body: JSON.stringify({
              status: "submitted",
              summary,
              file_ids: fileIds,
            }),
            fallbackMessage: "提交客户验收失败",
          },
        );
        setOpen(false);
        setUploadedAttachments([]);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "提交客户验收失败");
      }
    });
  }

  return (
    <Dialog open={canSubmit ? open : false} onOpenChange={(nextOpen) => {
      if (canSubmit) handleDialogOpenChange(nextOpen);
    }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={hasSubmittedAcceptance ? "secondary" : "outline"}
          disabled={!canSubmit}
          title={disabledReason}
        >
          <FileCheck2 data-icon="inline-start" />
          {hasSubmittedAcceptance ? "已提交验收" : "提交验收"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>提交客户验收</DialogTitle>
          <DialogDescription>
            {workOrder.order_no} · 提交后租户小程序将显示确认验收和要求整改操作。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`acceptance-summary-${workOrder.id}`}>
                验收摘要
              </FieldLabel>
              <Textarea
                id={`acceptance-summary-${workOrder.id}`}
                name="summary"
                defaultValue={DEFAULT_ACCEPTANCE_SUMMARY}
                maxLength={5000}
                required
              />
            </Field>
            <PlatformServiceFulfillmentAttachmentUploadField
              inputId={`acceptance-files-${workOrder.id}`}
              disabled={pending}
              attachments={uploadedAttachments}
              onAttachmentsChange={setUploadedAttachments}
              onUploadingChange={setUploading}
            />
          </FieldGroup>
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={pending || uploading}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || uploading}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              确认提交
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
