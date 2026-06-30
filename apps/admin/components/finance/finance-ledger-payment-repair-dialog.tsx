"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Archive, Link2, Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FormSelect } from "@/components/admin/form-select";
import type { FinanceLedgerRecord } from "@/components/finance/finance-requests";
import { formatFinanceDateTime, formatFinanceMoney } from "@/components/finance/finance-ledger-utils";
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

const NO_PAYMENT_VALUE = "__none";

type RepairMode = "link" | "legacy";

type PaymentCandidate = {
  id: string;
  amount: number | string | null;
  type: string | null;
  status: string | null;
  pay_date?: string | null;
  paid_at?: string | null;
  created_at: string | null;
  remark?: string | null;
};

type PaymentListData = {
  list: PaymentCandidate[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function FinanceLedgerPaymentRepairDialog({
  ledger,
  mode,
  onClose,
  onSaved,
}: {
  ledger: FinanceLedgerRecord;
  mode: RepairMode;
  onClose: () => void;
  onSaved: (ledger: FinanceLedgerRecord) => void;
}) {
  const [payments, setPayments] = useState<PaymentCandidate[]>([]);
  const [paymentId, setPaymentId] = useState(NO_PAYMENT_VALUE);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(mode === "link");
  const [pending, startTransition] = useTransition();

  const title = mode === "link" ? "关联已确认收款" : "标记历史收款流水";
  const paymentOptions = useMemo(() => {
    if (!payments.length) return [{ value: NO_PAYMENT_VALUE, label: "暂无已确认收款" }];
    return payments.map((payment) => ({
      value: payment.id,
      label: [
        formatFinanceMoney(payment.amount),
        payment.type || "收款",
        formatFinanceDateTime(payment.paid_at || payment.pay_date || payment.created_at),
      ].join(" · "),
    }));
  }, [payments]);
  const disabled = pending || !reason.trim() ||
    (mode === "link" && (loading || paymentId === NO_PAYMENT_VALUE));

  useEffect(() => {
    if (mode !== "link") return;
    void loadPayments();
  }, [ledger.project_id, mode]);

  async function loadPayments() {
    if (!ledger.project_id) {
      setError("这条流水没有关联项目，不能关联收款");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
        project_id: ledger.project_id,
        status: "confirmed",
      });
      const data = await requestBackendJson<PaymentListData>(`/payments?${params}`, {
        cache: "no-store",
        fallbackMessage: "已确认收款加载失败",
      });
      const list = data.list || [];
      setPayments(list);
      setPaymentId(list[0]?.id ?? NO_PAYMENT_VALUE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "已确认收款加载失败");
    } finally {
      setLoading(false);
    }
  }

  function submit() {
    const normalizedReason = reason.trim();
    if (!normalizedReason) return;

    setError("");
    startTransition(async () => {
      try {
        const updated = mode === "link"
          ? await requestBackendJson<FinanceLedgerRecord>(
            `/finance/ledger/${ledger.id}/link-payment`,
            {
              method: "POST",
              body: JSON.stringify({
                payment_id: paymentId,
                reason: normalizedReason,
              }),
              fallbackMessage: "关联收款失败",
            },
          )
          : await requestBackendJson<FinanceLedgerRecord>(
            `/finance/ledger/${ledger.id}/mark-legacy-payment`,
            {
              method: "POST",
              body: JSON.stringify({ reason: normalizedReason }),
              fallbackMessage: "标记历史流水失败",
            },
          );
        onSaved(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "收款流水修正失败");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            仅用于处理历史项目收款流水的对账异常，保存后会记录操作人和原因。
          </DialogDescription>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <div className="grid gap-4">
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{ledger.summary || "项目收款流水"}</div>
            <div className="text-muted-foreground">
              {formatFinanceMoney(ledger.amount)} · {ledger.project?.name || "未关联项目"}
            </div>
          </div>

          {mode === "link" ? (
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">已确认收款</span>
              <FormSelect
                id="ledger-payment-repair-payment"
                value={paymentId}
                options={paymentOptions}
                disabled={loading || pending || !payments.length}
                onChange={setPaymentId}
              />
            </label>
          ) : null}

          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">修正原因</span>
            <Textarea
              value={reason}
              maxLength={500}
              placeholder={mode === "link" ? "例如：历史台账与已确认收款补关联" : "例如：历史测试流水，不再纳入收款对账"}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            取消
          </Button>
          <Button type="button" disabled={disabled} onClick={submit}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : mode === "link" ? (
              <Link2 data-icon="inline-start" />
            ) : (
              <Archive data-icon="inline-start" />
            )}
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
