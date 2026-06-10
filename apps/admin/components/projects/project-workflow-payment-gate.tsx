"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { PaymentTypeConfig } from "@gooes/domain";
import { CheckCircle2, Loader2, WalletCards } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  createProjectPayment,
  fetchProjectPayments,
  type ProjectPaymentRecord,
} from "@/components/projects/project-payment-requests";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { formatMoney } from "@/components/projects/project-mutation-utils";
import type { WorkflowRuntimeInstance } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PaymentCollectionType = "deposit" | "stage_1" | "stage_2" | "stage_3" | "add_on";

export type WorkflowPaymentGate = {
  nodeKey: string;
  title: string;
  paymentType: PaymentCollectionType;
  paymentLabel: string;
  minAmount: number | null;
  blockMessage: string;
};

type PaymentSummary = {
  count: number;
  totalAmount: number;
};

export function getWorkflowPaymentGate(
  instance: WorkflowRuntimeInstance | null,
): WorkflowPaymentGate | null {
  const snapshot = instance?.current_node_snapshot;
  if (!isRecord(snapshot) || snapshot.business_kind !== "payment_collection") {
    return null;
  }

  const config = isRecord(snapshot.config) ? snapshot.config : {};
  const paymentType = parsePaymentCollectionType(config.payment_type);
  const paymentLabel = PaymentTypeConfig[paymentType].label;
  const title = typeof snapshot.title === "string" && snapshot.title.trim()
    ? snapshot.title.trim()
    : paymentLabel;
  const minAmount = typeof config.min_amount === "number" &&
      Number.isFinite(config.min_amount) &&
      config.min_amount > 0
    ? config.min_amount
    : null;
  const blockMessage = typeof config.block_message === "string" &&
      config.block_message.trim()
    ? config.block_message.trim()
    : "请先确认收款后再推进流程";

  return {
    nodeKey: instance?.current_node_key || "",
    title,
    paymentType,
    paymentLabel,
    minAmount,
    blockMessage,
  };
}

export function ProjectWorkflowPaymentGate({
  disabled,
  gate,
  project,
  onChanged,
}: {
  disabled?: boolean;
  gate: WorkflowPaymentGate;
  project: ProjectRecord;
  onChanged: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const satisfied = summary
    ? summary.count > 0 && (gate.minAmount === null || summary.totalAmount >= gate.minAmount)
    : false;
  const suggestedAmount = useMemo(() => {
    if (!gate.minAmount) return "";
    const remainingAmount = gate.minAmount - (summary?.totalAmount || 0);
    return remainingAmount > 0 ? String(remainingAmount) : "";
  }, [gate.minAmount, summary?.totalAmount]);

  function loadSummary() {
    startTransition(async () => {
      try {
        setError("");
        const data = await fetchProjectPayments({
          projectId: project.id,
          type: gate.paymentType,
          status: "confirmed",
        });
        setSummary(summarizePayments(data.list));
      } catch (err) {
        setError(err instanceof Error ? err.message : "收款状态加载失败");
      }
    });
  }

  function confirmPayment() {
    const normalizedAmount = Number(amount || suggestedAmount || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setError("请输入有效的入账金额");
      return;
    }

    startTransition(async () => {
      try {
        setError("");
        await createProjectPayment({
          project_id: project.id,
          amount: normalizedAmount,
          type: gate.paymentType,
          status: "confirmed",
        });
        setAmount("");
        const data = await fetchProjectPayments({
          projectId: project.id,
          type: gate.paymentType,
          status: "confirmed",
        });
        setSummary(summarizePayments(data.list));
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "确认收款失败");
      }
    });
  }

  useEffect(() => {
    setAmount(suggestedAmount);
  }, [suggestedAmount]);

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, gate.nodeKey, gate.paymentType]);

  return (
    <section className="rounded-md border bg-background p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <WalletCards className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold">当前节点需要确认收款</div>
              <Badge variant={satisfied ? "success" : "warning"}>
                {satisfied ? "已入账" : "待入账"}
              </Badge>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {gate.title} · {gate.paymentLabel}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>已入账 ¥{formatMoney(summary?.totalAmount || 0)}</span>
              {gate.minAmount ? (
                <span>要求 ¥{formatMoney(gate.minAmount)}</span>
              ) : null}
              {summary ? <span>{summary.count} 笔</span> : null}
            </div>
          </div>
        </div>
        {satisfied ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="size-4" />
            可以推进
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}
      {!satisfied ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor={`payment-gate-amount-${gate.nodeKey}`}>入账金额</Label>
            <Input
              id={`payment-gate-amount-${gate.nodeKey}`}
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              disabled={disabled || pending}
              placeholder="请输入金额"
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || pending}
            onClick={confirmPayment}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            确认已入账
          </Button>
        </div>
      ) : null}
      {!satisfied ? (
        <div className="mt-3 text-xs text-muted-foreground">{gate.blockMessage}</div>
      ) : null}
    </section>
  );
}

function summarizePayments(payments: ProjectPaymentRecord[]): PaymentSummary {
  return {
    count: payments.length,
    totalAmount: payments.reduce((sum, payment) => {
      return sum + Number(payment.amount || 0);
    }, 0),
  };
}

function parsePaymentCollectionType(value: unknown): PaymentCollectionType {
  if (
    value === "deposit" ||
    value === "stage_1" ||
    value === "stage_2" ||
    value === "stage_3" ||
    value === "add_on"
  ) {
    return value;
  }
  return "deposit";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
