"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import type {
  FinanceReconciliationAction,
  FinanceReconciliationActionListData,
  FinanceReconciliationActionRecord,
  FinanceReconciliationExceptionRecord,
} from "./finance-reconciliation-requests";
import {
  financeReconciliationActionLabel,
  financeReconciliationExceptionLabel,
  financeReconciliationStatusMeta,
} from "./finance-reconciliation-utils";
import { formatFinanceDateTime } from "./finance-ledger-utils";

const ACTION_OPTIONS: FinanceReconciliationAction[] = [
  "acknowledge",
  "resolve",
  "ignore",
  "reopen",
];

export function FinanceReconciliationActionDialog({
  row,
  onClose,
}: {
  row: FinanceReconciliationExceptionRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const [action, setAction] = useState<FinanceReconciliationAction>(
    row.status === "open" ? "acknowledge" : "reopen",
  );
  const [error, setError] = useState("");
  const [history, setHistory] = useState<FinanceReconciliationActionRecord[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const statusMeta = financeReconciliationStatusMeta(row.status);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError("");
    requestBackendJson<FinanceReconciliationActionListData>(
      `/finance/reconciliation/exceptions/${
        encodeURIComponent(row.exception_fingerprint)
      }/actions?page=1&pageSize=10`,
      {
        cache: "no-store",
        signal: controller.signal,
        fallbackMessage: "处理历史加载失败",
      },
    )
      .then((data) => setHistory(data.list || []))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setHistory([]);
        setHistoryError(err instanceof Error ? err.message : "处理历史加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });

    return () => controller.abort();
  }, [row.exception_fingerprint]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const remark = String(form.get("remark") || "").trim();

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/finance/reconciliation/exceptions/${
            encodeURIComponent(row.exception_fingerprint)
          }/actions`,
          {
            method: "POST",
            body: JSON.stringify({ action, remark }),
            fallbackMessage: "处理对账异常失败",
          },
        );
        onClose();
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "处理对账异常失败");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ClipboardCheck aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle>处理对账异常</DialogTitle>
              <DialogDescription>
                {financeReconciliationExceptionLabel(row.exception_code)} · {statusMeta.label}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <form id="reconciliation-action-form" className="grid gap-3" onSubmit={submit}>
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="truncate text-sm font-medium">{row.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.description}
            </div>
          </div>

          <div className="rounded-md border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                处理历史
              </span>
              <span className="text-xs text-muted-foreground">
                {historyLoading ? "加载中" : `${history.length} 条`}
              </span>
            </div>
            {historyError ? (
              <p className="mt-2 text-xs text-destructive">{historyError}</p>
            ) : history.length > 0 ? (
              <div className="mt-2 grid max-h-32 gap-2 overflow-auto pr-1">
                {history.map((item) => (
                  <div key={item.id} className="grid gap-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {financeReconciliationActionLabel(item.action)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatFinanceDateTime(item.created_at)}
                      </span>
                    </div>
                    <div className="truncate text-muted-foreground">
                      {[item.actor_employee_name || "未知处理人", item.remark]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                暂无处理历史
              </p>
            )}
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">处理动作</span>
            <Select
              value={action}
              disabled={pending}
              onValueChange={(value) =>
                setAction(value as FinanceReconciliationAction)}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择处理动作" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ACTION_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {financeReconciliationActionLabel(item)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">处理备注</span>
            <Textarea
              name="remark"
              required
              maxLength={500}
              disabled={pending}
              placeholder="填写处理原因、凭证或后续追踪说明"
            />
          </label>

          <p className="text-xs text-muted-foreground">
            该操作只写入对账异常处理记录，不修改收款、应收、核销或台账数据；人工闭环仅表示人工确认异常已闭环。
          </p>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            取消
          </Button>
          <Button type="submit" form="reconciliation-action-form" disabled={pending}>
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            保存处理
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
