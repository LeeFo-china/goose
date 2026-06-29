"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlusCircle } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { FinanceLedgerRecord } from "@/components/finance/finance-requests";
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

export function FinanceMissingPaymentLedgerPanel({
  paymentId,
}: {
  paymentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const disabled = pending || reason.trim().length === 0;

  function generate() {
    const normalizedReason = reason.trim();
    if (!normalizedReason) return;

    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const ledger = await requestBackendJson<FinanceLedgerRecord>(
          `/payments/${paymentId}/generate-ledger`,
          {
            method: "POST",
            body: JSON.stringify({ reason: normalizedReason }),
            fallbackMessage: "补生成项目收款台账失败",
          },
        );
        setMessage(`已补生成项目收款台账：${ledger.id}`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "补生成项目收款台账失败");
      }
    });
  }

  return (
    <div className="shrink-0 border-b bg-amber-50/80 px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-amber-900">
            未找到这笔收款的项目收款台账
          </div>
          <div className="mt-0.5 text-xs text-amber-800">
            可对已确认收款补生成入账流水，系统会按收款记录防重。
          </div>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <PlusCircle data-icon="inline-start" />
          补生成台账
        </Button>
      </div>
      {message ? <div className="mt-3"><StatusAlert tone="success">{message}</StatusAlert></div> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>补生成项目收款台账</DialogTitle>
            <DialogDescription>
              仅用于已确认收款缺少项目收款流水的对账修正。
            </DialogDescription>
          </DialogHeader>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <div className="grid gap-2">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="missing-payment-ledger-reason"
            >
              修正原因
            </label>
            <Textarea
              id="missing-payment-ledger-reason"
              value={reason}
              maxLength={500}
              placeholder="例如：对账异常确认后补生成项目收款入账流水"
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="button" disabled={disabled} onClick={generate}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <PlusCircle data-icon="inline-start" />
              )}
              确认补生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
