import { PaymentTypeConfig } from "@gooes/domain";
import type {
  FinanceReceivablePaymentCandidate,
  FinanceReceivableRecord,
} from "./finance-requests";

export type FinanceReceivableAllocationSummary = {
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  canAllocate: boolean;
};

export type FinanceReceivablePaymentOption = {
  value: string;
  label: string;
  amount: number;
  allocatedAmount: number;
  remainingAmount: number;
};

export function calculateReceivableAllocationSummary(input: Pick<
  FinanceReceivableRecord,
  "amount" | "paid_amount" | "remaining_amount"
>): FinanceReceivableAllocationSummary {
  const amount = normalizeMoney(input.amount);
  const paidAmount = normalizeMoney(input.paid_amount);
  const remainingAmount = Math.max(normalizeMoney(input.remaining_amount), 0);
  return {
    amount,
    paidAmount,
    remainingAmount,
    canAllocate: remainingAmount > 0,
  };
}

export function buildAllocationPaymentOptions(
  payments: FinanceReceivablePaymentCandidate[],
): FinanceReceivablePaymentOption[] {
  return payments
    .filter((payment) => normalizeMoney(payment.remaining_amount) > 0)
    .map((payment) => {
      const amount = normalizeMoney(payment.amount);
      const allocatedAmount = normalizeMoney(payment.allocated_amount);
      const remainingAmount = normalizeMoney(payment.remaining_amount);
      return {
        value: payment.id,
        label: [
          paymentTypeLabel(payment.type),
          formatDate(payment.pay_date),
          `收款 ${formatMoney(amount)}`,
          `可核销 ${formatMoney(remainingAmount)}`,
        ].filter(Boolean).join(" · "),
        amount,
        allocatedAmount,
        remainingAmount,
      };
    });
}

function paymentTypeLabel(value: string | null) {
  if (value && value in PaymentTypeConfig) {
    return PaymentTypeConfig[value as keyof typeof PaymentTypeConfig].label;
  }
  return value || "项目收款";
}

function formatDate(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatMoney(value: number) {
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}
