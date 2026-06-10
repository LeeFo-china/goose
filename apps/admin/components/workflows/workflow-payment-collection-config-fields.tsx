"use client";

import { PaymentTypeConfig } from "@gooes/domain";
import type {
  WorkflowNodeConfig,
  WorkflowPaymentCollectionNodeConfig,
} from "@/components/workflows/workflow-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const WORKFLOW_PAYMENT_COLLECTION_OPTIONS = [
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
] as const;

export function getWorkflowPaymentCollectionLabel(
  paymentType: string | null | undefined,
) {
  if (!paymentType || paymentType === "refund") return "";
  return PaymentTypeConfig[paymentType as keyof typeof PaymentTypeConfig]?.label ||
    "";
}

function parseOptionalPaymentAmount(value: string) {
  const normalized = value.trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function WorkflowPaymentCollectionConfigFields({
  config,
  disabled,
  onChangeConfig,
}: {
  config: WorkflowNodeConfig;
  disabled?: boolean;
  onChangeConfig: (patch: Partial<WorkflowPaymentCollectionNodeConfig>) => void;
}) {
  const paymentConfig = config as WorkflowPaymentCollectionNodeConfig;

  return (
    <section className="space-y-3">
      <div>
        <div className="text-sm font-medium">收款配置</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          选择需要确认入账的款项，未入账时流程不能继续。
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-type">收款类型</Label>
        <Select
          disabled={disabled}
          value={paymentConfig.payment_type || "deposit"}
          onValueChange={(value) =>
            onChangeConfig({
              payment_type: value as WorkflowPaymentCollectionNodeConfig["payment_type"],
            })
          }
        >
          <SelectTrigger id="workflow-node-payment-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKFLOW_PAYMENT_COLLECTION_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {PaymentTypeConfig[value].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-min-amount">最低已入账金额</Label>
        <Input
          id="workflow-node-payment-min-amount"
          type="number"
          min={0}
          value={paymentConfig.min_amount ?? ""}
          disabled={disabled}
          placeholder="为空时只要求存在已入账收款"
          onChange={(event) => {
            onChangeConfig({
              min_amount: parseOptionalPaymentAmount(event.target.value),
            });
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workflow-node-payment-block-message">阻塞提示</Label>
        <Input
          id="workflow-node-payment-block-message"
          value={paymentConfig.block_message || ""}
          disabled={disabled}
          maxLength={200}
          placeholder="请先确认收款后再推进流程"
          onChange={(event) =>
            onChangeConfig({
              block_message: event.target.value.trim() || null,
            })
          }
        />
      </div>
    </section>
  );
}
