"use client";

import { useEffect, useState, useTransition } from "react";
import { PaymentTypeConfig } from "@gooes/domain";
import { CheckCircle2, WalletCards } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  fetchProjectPayments,
  type ProjectPaymentRecord,
} from "@/components/projects/project-payment-requests";
import type { ProjectRecord } from "@/components/projects/project-mutation-types";
import { formatMoney } from "@/components/projects/project-mutation-utils";
import type { WorkflowRuntimeInstance } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";

type PaymentCollectionType = "deposit" | "stage_1" | "stage_2" | "stage_3" | "add_on";

export type WorkflowPaymentGate = {
  nodeKey: string;
  title: string;
  paymentType: PaymentCollectionType;
  paymentLabel: string;
  requirementMode: "any_confirmed" | "signed_amount_percentage";
  requiredPercentage: number | null;
  legacyMinAmount: number | null;
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
  const requirementMode = parsePaymentRequirementMode(config.requirement_mode);
  const requiredPercentage = typeof config.required_percentage === "number" &&
      Number.isFinite(config.required_percentage) &&
      config.required_percentage > 0 &&
      config.required_percentage <= 100
    ? config.required_percentage
    : null;
  const legacyMinAmount = !isPaymentRequirementMode(config.requirement_mode) &&
      typeof config.min_amount === "number" &&
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
    requirementMode,
    requiredPercentage,
    legacyMinAmount,
    blockMessage,
  };
}

export function ProjectWorkflowPaymentGate({
  gate,
  project,
}: {
  disabled?: boolean;
  gate: WorkflowPaymentGate;
  project: ProjectRecord;
  onChanged: () => void;
}) {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const requiredAmount = getRequiredPaymentAmount(gate, project);
  const missingSignedAmount = gate.requirementMode === "signed_amount_percentage" &&
    requiredAmount === null;

  const satisfied = summary
    ? !missingSignedAmount &&
      summary.count > 0 &&
      (requiredAmount === null || summary.totalAmount >= requiredAmount)
    : false;

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
              <Badge variant={satisfied ? "success" : pending ? "secondary" : "warning"}>
                {satisfied ? "已入账" : pending ? "刷新中" : "待入账"}
              </Badge>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {gate.title} · {gate.paymentLabel}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>已入账 ¥{formatMoney(summary?.totalAmount || 0)}</span>
              {requiredAmount ? (
                <span>要求 ¥{formatMoney(requiredAmount)}</span>
              ) : null}
              {gate.requiredPercentage ? (
                <span>签约金额 {gate.requiredPercentage}%</span>
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
      {missingSignedAmount ? (
        <div className="mt-3">
          <StatusAlert>项目缺少签约金额，无法按比例校验收款要求。</StatusAlert>
        </div>
      ) : null}
      {!satisfied ? (
        <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          请在待办中心确认收款，确认后流程会自动推进。
        </div>
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

function parsePaymentRequirementMode(value: unknown) {
  if (value === "signed_amount_percentage") return value;
  return "any_confirmed";
}

function isPaymentRequirementMode(value: unknown) {
  return value === "any_confirmed" || value === "signed_amount_percentage";
}

function getRequiredPaymentAmount(
  gate: WorkflowPaymentGate,
  project: ProjectRecord,
) {
  if (gate.legacyMinAmount) {
    return gate.legacyMinAmount;
  }
  if (gate.requirementMode !== "signed_amount_percentage") {
    return null;
  }
  const signedAmount = Number(project.signed_amount || 0);
  if (
    !Number.isFinite(signedAmount) ||
    signedAmount <= 0 ||
    !gate.requiredPercentage
  ) {
    return null;
  }
  return Number((signedAmount * gate.requiredPercentage / 100).toFixed(2));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
