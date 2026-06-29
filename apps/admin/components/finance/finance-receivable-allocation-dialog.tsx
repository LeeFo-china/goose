"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PencilLine, ReceiptText, RotateCcw, Save } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import type {
  FinanceReceivableAllocationContext,
  FinanceReceivableAllocationMutationResult,
  FinanceReceivableAllocationRecord,
  FinanceReceivableRecord,
} from "./finance-requests";
import {
  buildAllocationPaymentOptions,
  calculateReceivableAllocationSummary,
} from "./finance-receivable-allocation-utils";
import {
  formatFinanceDate,
  formatFinanceMoney,
} from "./finance-ledger-utils";

const NO_PAYMENT_VALUE = "__none";

type OperationMode = "create" | "adjust" | "reverse";

export function FinanceReceivableAllocationDialog({
  row,
  onClose,
}: {
  row: FinanceReceivableRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const [context, setContext] = useState<FinanceReceivableAllocationContext | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<OperationMode>("create");
  const [activeAllocation, setActiveAllocation] =
    useState<FinanceReceivableAllocationRecord | null>(null);
  const [paymentId, setPaymentId] = useState(NO_PAYMENT_VALUE);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const receivable = context?.receivable_plan ?? row;
  const summary = calculateReceivableAllocationSummary(receivable);
  const paymentOptions = useMemo(
    () => buildAllocationPaymentOptions(context?.payments ?? []),
    [context?.payments],
  );
  const selectOptions = paymentOptions.length
    ? paymentOptions
    : [{ value: NO_PAYMENT_VALUE, label: "暂无可核销收款" }];
  const activePayment = paymentOptions.find((option) => option.value === paymentId);

  useEffect(() => {
    void loadContext();
  }, [row.id]);

  useEffect(() => {
    if (!context || mode !== "create") return;
    const first = paymentOptions[0];
    setPaymentId(first?.value ?? NO_PAYMENT_VALUE);
    setAmount(first ? String(defaultCreateAmount(summary.remainingAmount, first.remainingAmount)) : "");
  }, [context, mode, paymentOptions, summary.remainingAmount]);

  async function loadContext() {
    setLoading(true);
    setError("");
    try {
      const data = await requestBackendJson<FinanceReceivableAllocationContext>(
        `/finance/receivables/${row.id}/allocation-context`,
        { fallbackMessage: "核销上下文加载失败" },
      );
      setContext(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "核销上下文加载失败");
    } finally {
      setLoading(false);
    }
  }

  function selectPayment(nextPaymentId: string) {
    setPaymentId(nextPaymentId);
    const option = paymentOptions.find((item) => item.value === nextPaymentId);
    setAmount(option ? String(defaultCreateAmount(summary.remainingAmount, option.remainingAmount)) : "");
  }

  function startAdjust(allocation: FinanceReceivableAllocationRecord) {
    setMode("adjust");
    setActiveAllocation(allocation);
    setAmount(String(allocation.amount));
    setReason("");
  }

  function startReverse(allocation: FinanceReceivableAllocationRecord) {
    setMode("reverse");
    setActiveAllocation(allocation);
    setAmount(String(allocation.amount));
    setReason("");
  }

  function resetForm() {
    setMode("create");
    setActiveAllocation(null);
    setReason("");
    selectPayment(paymentOptions[0]?.value ?? NO_PAYMENT_VALUE);
  }

  function submit() {
    setError("");
    const numericAmount = Number(amount);
    if (mode === "create" && paymentId === NO_PAYMENT_VALUE) {
      setError("请选择可核销收款");
      return;
    }
    if (mode !== "reverse" && (!Number.isFinite(numericAmount) || numericAmount <= 0)) {
      setError("请输入有效核销金额");
      return;
    }
    if (!reason.trim()) {
      setError("请输入操作原因");
      return;
    }

    startTransition(async () => {
      try {
        await executeMutation({ numericAmount });
        await loadContext();
        resetForm();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "收款核销失败");
      }
    });
  }

  async function executeMutation(input: { numericAmount: number }) {
    if (mode === "adjust" && activeAllocation) {
      return requestBackendJson<FinanceReceivableAllocationMutationResult>(
        `/finance/receivables/${row.id}/allocations/${activeAllocation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ amount: input.numericAmount, reason: reason.trim() }),
          fallbackMessage: "调整核销失败",
        },
      );
    }
    if (mode === "reverse" && activeAllocation) {
      return requestBackendJson<FinanceReceivableAllocationMutationResult>(
        `/finance/receivables/${row.id}/allocations/${activeAllocation.id}/reverse`,
        {
          method: "POST",
          body: JSON.stringify({ reason: reason.trim() }),
          fallbackMessage: "撤销核销失败",
        },
      );
    }
    return requestBackendJson<FinanceReceivableAllocationMutationResult>(
      `/finance/receivables/${row.id}/allocations`,
      {
        method: "POST",
        body: JSON.stringify({
          payment_id: paymentId,
          amount: input.numericAmount,
          reason: reason.trim(),
        }),
        fallbackMessage: "收款核销失败",
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>收款核销</DialogTitle>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <div className="grid gap-4">
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
            <SummaryItem label="应收" value={formatFinanceMoney(summary.amount)} />
            <SummaryItem label="已收" value={formatFinanceMoney(summary.paidAmount)} />
            <SummaryItem label="未收" value={formatFinanceMoney(summary.remainingAmount)} />
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">收款记录</span>
              <FormSelect
                id="receivable-allocation-payment"
                value={mode === "create" ? paymentId : NO_PAYMENT_VALUE}
                options={selectOptions}
                disabled={loading || pending || mode !== "create" || paymentOptions.length === 0}
                onChange={selectPayment}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">核销金额</span>
              <Input
                className="h-9"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                disabled={loading || pending || mode === "reverse"}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
          </div>

          {activePayment && mode === "create" ? (
            <div className="text-xs text-muted-foreground">
              已核销 {formatFinanceMoney(activePayment.allocatedAmount)}，剩余可核销{" "}
              {formatFinanceMoney(activePayment.remainingAmount)}
            </div>
          ) : null}

          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              {mode === "reverse" ? "撤销原因" : mode === "adjust" ? "调整原因" : "核销原因"}
            </span>
            <Textarea
              value={reason}
              disabled={loading || pending}
              placeholder="请输入原因"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          {mode !== "create" ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                当前操作：{activeAllocation?.payment?.type || "收款"} /{" "}
                {formatFinanceMoney(activeAllocation?.amount ?? 0)}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                返回新增
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">已核销记录</div>
            <div className="max-h-[220px] overflow-auto rounded-md border">
              {(context?.allocations ?? []).length ? (
                (context?.allocations ?? []).map((allocation) => (
                  <AllocationRow
                    key={allocation.id}
                    allocation={allocation}
                    disabled={pending || loading}
                    onAdjust={startAdjust}
                    onReverse={startReverse}
                  />
                ))
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  暂无核销记录
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            关闭
          </Button>
          <Button type="button" disabled={loading || pending} onClick={submit}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : mode === "reverse" ? (
              <RotateCcw data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {mode === "reverse" ? "撤销核销" : mode === "adjust" ? "保存调整" : "确认核销"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AllocationRow({
  allocation,
  disabled,
  onAdjust,
  onReverse,
}: {
  allocation: FinanceReceivableAllocationRecord;
  disabled: boolean;
  onAdjust: (allocation: FinanceReceivableAllocationRecord) => void;
  onReverse: (allocation: FinanceReceivableAllocationRecord) => void;
}) {
  const isManual = allocation.source_type === "manual";
  return (
    <div className="grid gap-2 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium tabular-nums">{formatFinanceMoney(allocation.amount)}</span>
          <span className="text-muted-foreground">
            {allocation.payment?.pay_date ? formatFinanceDate(allocation.payment.pay_date) : "-"}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {allocation.allocated_by_name || "系统"} · {allocation.source_type}
        </div>
      </div>
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          disabled={disabled || !isManual}
          onClick={() => onAdjust(allocation)}
        >
          <PencilLine data-icon="inline-start" />
          调整
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-destructive hover:text-destructive"
          disabled={disabled || !isManual}
          onClick={() => onReverse(allocation)}
        >
          <RotateCcw data-icon="inline-start" />
          撤销
        </Button>
      </div>
    </div>
  );
}

function defaultCreateAmount(receivableRemaining: number, paymentRemaining: number) {
  return Math.max(Math.min(receivableRemaining, paymentRemaining), 0);
}
