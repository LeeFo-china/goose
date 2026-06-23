import type { ProjectReceivablePlanRecord } from "@/repositories/project-receivable-plans";
import type { ProjectReceivableStatus } from "@/schema/finance-receivables";
import type {
  WorkflowReceivableActionContext,
} from "@/services/workflow-task-action-metadata";

export type WorkflowReceivableConfig = {
  enabled: boolean;
  paymentType: "deposit" | "stage_1" | "stage_2" | "stage_3" | "add_on";
  amountMode: "fixed_amount" | "signed_amount_percentage";
  fixedAmount: number | null;
  percentage: number | null;
  dueOffsetDays: number;
  title: string;
};

export function getPaymentCollectionReceivableConfig(
  nodeSnapshot: unknown,
): WorkflowReceivableConfig {
  const snapshot = isRecord(nodeSnapshot) ? nodeSnapshot : {};
  const config = isRecord(snapshot.config) ? snapshot.config : {};
  const title = readString(config.receivable_title) ||
    readString(snapshot.title) ||
    "项目收款";

  return {
    enabled: config.receivable_plan_enabled === true,
    paymentType: getPaymentType(config.payment_type),
    amountMode: config.receivable_amount_mode === "fixed_amount"
      ? "fixed_amount"
      : "signed_amount_percentage",
    fixedAmount: readPositiveNumber(config.receivable_fixed_amount),
    percentage: readPositiveNumber(config.receivable_percentage),
    dueOffsetDays: Math.min(
      Math.max(Math.trunc(Number(config.receivable_due_offset_days ?? 0)), 0),
      3650,
    ),
    title,
  };
}

export function buildReceivableDueDate(input: {
  taskCreatedAt: string | null;
  offsetDays: number;
}) {
  const baseTime = input.taskCreatedAt ? Date.parse(input.taskCreatedAt) : NaN;
  const date = Number.isFinite(baseTime) ? new Date(baseTime) : new Date();
  date.setUTCDate(date.getUTCDate() + input.offsetDays);
  return date.toISOString().slice(0, 10);
}

export function buildWorkflowReceivableContext(
  plan: ProjectReceivablePlanRecord,
  tenantToday: string,
): WorkflowReceivableActionContext {
  const remainingAmount = Math.max(plan.amount - plan.paid_amount, 0);
  const overdueDays = getOverdueDays({
    dueDate: plan.due_date,
    tenantToday,
    status: plan.status,
    remainingAmount,
  });

  return {
    receivable_plan_id: plan.id,
    receivable_title: plan.title,
    receivable_amount: plan.amount,
    receivable_paid_amount: plan.paid_amount,
    receivable_remaining_amount: remainingAmount,
    receivable_due_date: plan.due_date,
    receivable_status: deriveRuntimeReceivableStatus({
      status: plan.status,
      paidAmount: plan.paid_amount,
      remainingAmount,
      overdueDays,
    }),
    receivable_overdue_days: overdueDays,
  };
}

export function deriveStoredReceivableStatus(
  paidAmount: number,
): ProjectReceivableStatus {
  return paidAmount > 0 ? "paid" : "pending";
}

function deriveRuntimeReceivableStatus(input: {
  status: ProjectReceivableStatus;
  paidAmount: number;
  remainingAmount: number;
  overdueDays: number;
}): ProjectReceivableStatus {
  if (input.status === "canceled") return "canceled";
  if (input.remainingAmount <= 0) return "paid";
  if (input.overdueDays > 0) return "overdue";
  if (input.paidAmount > 0) return "partially_paid";
  if (input.status === "partially_paid") return "partially_paid";
  return "pending";
}

function getOverdueDays(input: {
  dueDate: string | null;
  tenantToday: string;
  status: ProjectReceivableStatus;
  remainingAmount: number;
}) {
  if (
    !input.dueDate ||
    input.remainingAmount <= 0 ||
    input.status === "paid" ||
    input.status === "canceled" ||
    input.dueDate >= input.tenantToday
  ) {
    return 0;
  }

  const due = Date.parse(`${input.dueDate}T00:00:00.000Z`);
  const today = Date.parse(`${input.tenantToday}T00:00:00.000Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today) || today <= due) {
    return 0;
  }

  return Math.floor((today - due) / 86_400_000);
}

function getPaymentType(value: unknown): WorkflowReceivableConfig["paymentType"] {
  return value === "deposit" ||
      value === "stage_1" ||
      value === "stage_2" ||
      value === "stage_3" ||
      value === "add_on"
    ? value
    : "deposit";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPositiveNumber(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
