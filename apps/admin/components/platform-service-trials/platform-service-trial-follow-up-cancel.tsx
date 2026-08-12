"use client";

import { useRef, useState } from "react";
import { CircleX } from "lucide-react";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

import { createTrialIdempotencyIntent } from "./platform-service-trial-idempotency";
import type { PlatformServiceTrialFollowUp } from "./platform-service-trial-types";

export function PlatformServiceTrialFollowUpCancel({
  trialId,
  followUp,
  canManage,
  onCanceled,
}: {
  trialId: string;
  followUp: PlatformServiceTrialFollowUp;
  canManage: boolean;
  onCanceled: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const idempotencyIntent = useRef(createTrialIdempotencyIntent()).current;

  if (followUp.status !== "pending") return null;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      idempotencyIntent.beginNew();
      setError("");
    }
    if (!pending) setOpen(nextOpen);
  }

  async function cancelFollowUp() {
    setPending(true);
    setError("");
    try {
      await requestBackendJson<PlatformServiceTrialFollowUp>(
        `/platform/billing/service-trials/${trialId}/follow-ups/${followUp.id}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            status: "canceled",
            idempotency_key: idempotencyIntent.current(),
          }),
          fallbackMessage: "取消试用跟进失败",
        },
      );
      toast.success("待跟进任务已取消");
      setOpen(false);
      await onCanceled();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "取消试用跟进失败";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" disabled={!canManage}>
          <CircleX data-icon="inline-start" />
          取消任务
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>取消待跟进任务？</AlertDialogTitle>
          <AlertDialogDescription>
            只取消当前运营任务，不会改变租户的试用状态或访问权限。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <div role="alert"><StatusAlert>{error}</StatusAlert></div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>返回</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void cancelFollowUp();
            }}
          >
            <span data-icon="inline-start" className="relative size-4">
              <CircleX className={cn(pending && "invisible")} />
              {pending ? <Spinner className="absolute inset-0" /> : null}
            </span>
            {pending ? "取消中" : "确认取消"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
