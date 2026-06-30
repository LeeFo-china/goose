"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FilePlus2, Loader2, RotateCcw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import type { FinanceClosingStatus } from "./finance-operating-report-utils";

type ClosingActionMode = "draft" | "close" | "reopen";

export function FinanceClosingActions({
  month,
  periodId,
  status,
}: {
  month: string;
  periodId: string | null;
  status: FinanceClosingStatus;
}) {
  const [mode, setMode] = useState<ClosingActionMode | null>(null);
  const canDraft = status !== "closed";
  const canClose = Boolean(periodId) && (status === "draft" || status === "reopened");
  const canReopen = Boolean(periodId) && status === "closed";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!month || !canDraft}
        onClick={() => setMode("draft")}
      >
        <FilePlus2 data-icon="inline-start" />
        生成草稿快照
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!canClose}
        onClick={() => setMode("close")}
      >
        <CheckCircle2 data-icon="inline-start" />
        确认结账
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canReopen}
        onClick={() => setMode("reopen")}
      >
        <RotateCcw data-icon="inline-start" />
        反结账
      </Button>
      {mode ? (
        <FinanceClosingActionDialog
          mode={mode}
          month={month}
          periodId={periodId}
          onClose={() => setMode(null)}
        />
      ) : null}
    </div>
  );
}

function FinanceClosingActionDialog({
  mode,
  month,
  periodId,
  onClose,
}: {
  mode: ClosingActionMode;
  month: string;
  periodId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const title = actionTitle(mode);
  const requiresReason = mode === "reopen";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const text = String(form.get("notes") || "").trim();
    if (requiresReason && !text) {
      setError("请填写反结账原因");
      return;
    }

    startTransition(async () => {
      try {
        await requestBackendJson(actionPath(mode, periodId), {
          method: "POST",
          body: JSON.stringify(
            mode === "draft"
              ? { month, notes: text || undefined }
              : mode === "close"
                ? { notes: text || undefined }
                : { reason: text },
          ),
          fallbackMessage: `${title}失败`,
        });
        onClose();
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : `${title}失败`);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "draft"
              ? `将按 ${month} 当前实时数据生成草稿快照。`
              : mode === "close"
                ? "确认后会重新固化当前实时数据为结账快照。"
                : "反结账后可重新生成草稿或再次确认结账。"}
          </DialogDescription>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <form id="finance-closing-action-form" className="grid gap-3" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {requiresReason ? "反结账原因" : "备注"}
            </span>
            <Textarea
              name="notes"
              required={requiresReason}
              disabled={pending}
              placeholder={requiresReason ? "例如：补录费用后重算本月报表" : "可选"}
              className="min-h-24"
            />
          </label>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="finance-closing-action-form" disabled={pending}>
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function actionTitle(mode: ClosingActionMode) {
  if (mode === "draft") return "生成草稿快照";
  if (mode === "close") return "确认结账";
  return "反结账";
}

function actionPath(mode: ClosingActionMode, periodId: string | null) {
  if (mode === "draft") return "/finance/closing-periods";
  if (!periodId) return "/finance/closing-periods";
  if (mode === "close") return `/finance/closing-periods/${periodId}/close`;
  return `/finance/closing-periods/${periodId}/reopen`;
}
