import {
  billingSubscriptionRepository,
  type BillingSubscriptionRpcResult,
  type TenantBillingPlanRecord,
  type TenantBillingSubscriptionRecord,
  type TenantBillingSubscriptionLockState,
  type TenantSubscriptionInvoiceRecord,
  type TenantSubscriptionInvoiceStatus,
  type TenantSubscriptionInvoiceWithLedgerRecord,
  type TenantSubscriptionLedgerRecord,
} from "@/repositories/billing-subscriptions";
import { Errors } from "@/errors/error-factory";
import type { BillingSubscriptionInvoiceQuery } from "@/schema/billing";

export type BillingDueCheckInput = {
  now?: Date;
  batchSize?: number;
  operatorUserId?: string | null;
};

export type BillingDueCheckResult = {
  reminded: number;
  charged: number;
  locked: number;
  skipped: number;
  errors: string[];
};

export type BillingSubscriptionRepositoryPort = {
  findSubscriptionByTenantId: (
    tenantId: string,
  ) => Promise<TenantBillingSubscriptionRecord | null>;
  findPlanById: (planId: string) => Promise<TenantBillingPlanRecord | null>;
  findOpenInvoiceDetailByTenantId: (
    tenantId: string,
  ) => Promise<TenantSubscriptionInvoiceWithLedgerRecord | null>;
  listInvoicesByTenantId: (input: {
    tenantId: string;
    page: number;
    pageSize: number;
    status?: TenantSubscriptionInvoiceStatus;
  }) => Promise<{
    list: TenantSubscriptionInvoiceWithLedgerRecord[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }>;
  findInvoiceByTenantId: (input: {
    tenantId: string;
    invoiceId: string;
  }) => Promise<TenantSubscriptionInvoiceWithLedgerRecord | null>;
  listInvoicesDueForReminder: (input: {
    nowIso: string;
    page?: number;
    pageSize?: number;
  }) => Promise<TenantSubscriptionInvoiceRecord[]>;
  markInvoiceReminded: (
    invoiceId: string,
  ) => Promise<TenantSubscriptionInvoiceRecord | null>;
  listInvoicesDueForCharge: (input: {
    nowIso: string;
    page?: number;
    pageSize?: number;
  }) => Promise<TenantSubscriptionInvoiceRecord[]>;
  chargeInvoice: (input: {
    invoiceId: string;
    operatorUserId?: string | null;
  }) => Promise<BillingSubscriptionRpcResult>;
  recoverAfterRecharge: (
    tenantId: string,
  ) => Promise<BillingSubscriptionRpcResult>;
  getLockStateByTenantId: (
    tenantId: string,
  ) => Promise<TenantBillingSubscriptionLockState>;
};

export type BillingSubscriptionServiceDependencies = {
  repository?: BillingSubscriptionRepositoryPort;
};

export class BillingSubscriptionService {
  private repository: BillingSubscriptionRepositoryPort;

  constructor(dependencies: BillingSubscriptionServiceDependencies = {}) {
    this.repository = dependencies.repository ?? billingSubscriptionRepository;
  }

  async runDueChecks(
    input: BillingDueCheckInput = {},
  ): Promise<BillingDueCheckResult> {
    const nowIso = (input.now ?? new Date()).toISOString();
    const batchSize = Math.min(
      normalizePositiveInteger(input.batchSize, 100),
      100,
    );
    const result: BillingDueCheckResult = {
      reminded: 0,
      charged: 0,
      locked: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const reminderInvoices = await this.repository.listInvoicesDueForReminder({
        nowIso,
        page: 1,
        pageSize: batchSize,
      });

      for (const invoice of reminderInvoices) {
        try {
          const remindedInvoice = await this.repository.markInvoiceReminded(
            invoice.id,
          );
          if (remindedInvoice) {
            result.reminded += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.errors.push(formatInvoiceError(invoice.id, error));
        }
      }
    } catch (error) {
      result.errors.push(formatPhaseError("reminders", error));
    }

    try {
      const chargeInvoices = await this.repository.listInvoicesDueForCharge({
        nowIso,
        page: 1,
        pageSize: batchSize,
      });

      for (const invoice of chargeInvoices) {
        try {
          const chargeResult = await this.repository.chargeInvoice({
            invoiceId: invoice.id,
            operatorUserId: input.operatorUserId ?? null,
          });

          if (chargeResult.charged === true) {
            result.charged += 1;
          }
          if (chargeResult.failure_code === "TENANT_CREDITS_INSUFFICIENT") {
            result.locked += 1;
          }
          if (chargeResult.idempotent === true) {
            result.skipped += 1;
          }
        } catch (error) {
          result.errors.push(formatInvoiceError(invoice.id, error));
        }
      }
    } catch (error) {
      result.errors.push(formatPhaseError("charges", error));
    }

    return result;
  }

  async recoverAfterRecharge(
    tenantId: string,
  ): Promise<BillingSubscriptionRpcResult> {
    return this.repository.recoverAfterRecharge(tenantId);
  }

  async getTenantLockState(
    tenantId: string,
  ): Promise<TenantBillingSubscriptionLockState> {
    return this.repository.getLockStateByTenantId(tenantId);
  }

  async getTenantSubscription(tenantId: string) {
    const [subscription, openInvoice, lock] = await Promise.all([
      this.repository.findSubscriptionByTenantId(tenantId),
      this.repository.findOpenInvoiceDetailByTenantId(tenantId),
      this.repository.getLockStateByTenantId(tenantId),
    ]);
    const plan = subscription
      ? await this.repository.findPlanById(subscription.plan_id)
      : null;

    return {
      plan: formatPlan(plan),
      subscription: formatSubscription(subscription),
      current_invoice: openInvoice ? formatInvoice(openInvoice) : null,
      lock: formatLock(lock),
    };
  }

  async listTenantInvoices(
    tenantId: string,
    query: BillingSubscriptionInvoiceQuery,
  ) {
    const result = await this.repository.listInvoicesByTenantId({
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });

    return {
      list: result.list.map(formatInvoice),
      pagination: result.pagination,
    };
  }

  async getTenantInvoice(tenantId: string, invoiceId: string) {
    const invoice = await this.repository.findInvoiceByTenantId({
      tenantId,
      invoiceId,
    });
    if (!invoice) {
      throw Errors.business(
        404,
        "系统使用费账单不存在",
        "BILLING_SUBSCRIPTION_INVOICE_NOT_FOUND",
      );
    }

    return formatInvoice(invoice);
  }
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function formatInvoiceError(invoiceId: string, error: unknown): string {
  return `${invoiceId}: ${formatErrorMessage(error)}`;
}

function formatPhaseError(phase: "reminders" | "charges", error: unknown): string {
  return `${phase}: ${formatErrorMessage(error)}`;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "正常",
  past_due: "待缴费",
  locked: "已锁定",
  canceled: "已取消",
};

const INVOICE_STATUS_LABELS: Record<TenantSubscriptionInvoiceStatus, string> = {
  upcoming: "待扣费",
  reminded: "待充值",
  paid: "已支付",
  past_due: "已逾期",
  failed: "扣费失败",
  void: "已作废",
};

const PAYABLE_INVOICE_STATUSES = new Set<TenantSubscriptionInvoiceStatus>([
  "reminded",
  "past_due",
  "failed",
]);

function formatPlan(plan: TenantBillingPlanRecord | null) {
  if (!plan) return null;

  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    period: plan.period,
    monthly_fee_credits: Number(plan.monthly_fee_credits || 0),
    reminder_days_before_due: Number(plan.reminder_days_before_due || 0),
    enabled: plan.enabled,
    version: plan.version,
  };
}

function formatSubscription(subscription: TenantBillingSubscriptionRecord | null) {
  if (!subscription) return null;

  return {
    id: subscription.id,
    tenant_id: subscription.tenant_id,
    plan_id: subscription.plan_id,
    status: subscription.status,
    status_label: SUBSCRIPTION_STATUS_LABELS[subscription.status] ||
      subscription.status,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    next_charge_at: subscription.next_charge_at,
    locked_at: subscription.locked_at,
    lock_reason: subscription.lock_reason,
    last_invoice_id: subscription.last_invoice_id,
  };
}

function formatLock(lock: TenantBillingSubscriptionLockState) {
  if (!lock.locked) {
    return {
      locked: false,
      reason: null,
      locked_at: null,
      last_invoice_id: lock.subscription?.last_invoice_id ?? null,
    };
  }

  return {
    locked: true,
    reason: lock.reason,
    locked_at: lock.locked_at,
    last_invoice_id: lock.last_invoice_id,
  };
}

function formatInvoice(invoice: TenantSubscriptionInvoiceWithLedgerRecord) {
  return {
    id: invoice.id,
    tenant_id: invoice.tenant_id,
    subscription_id: invoice.subscription_id,
    plan_id: invoice.plan_id,
    period_start: invoice.period_start,
    period_end: invoice.period_end,
    due_at: invoice.due_at,
    amount_credits: Number(invoice.amount_credits || 0),
    status: invoice.status,
    status_label: INVOICE_STATUS_LABELS[invoice.status] || invoice.status,
    reminder_due_at: invoice.reminder_due_at,
    reminded_at: invoice.reminded_at,
    paid_at: invoice.paid_at,
    ledger_id: invoice.ledger_id,
    failure_code: invoice.failure_code,
    failure_message: invoice.failure_message,
    ledger: formatLedger(invoice.ledger),
    payment_hint: buildPaymentHint(invoice),
    created_at: invoice.created_at,
    updated_at: invoice.updated_at,
  };
}

function formatLedger(ledger?: TenantSubscriptionLedgerRecord | null) {
  if (!ledger) return null;

  return {
    id: ledger.id,
    tenant_id: ledger.tenant_id,
    direction: ledger.direction,
    change_credits: Number(ledger.change_credits || 0),
    balance_after: Number(ledger.balance_after || 0),
    frozen_after: Number(ledger.frozen_after || 0),
    event_type: ledger.event_type,
    event_type_label: ledger.event_type === "subscription_monthly_fee"
      ? "系统月度使用费"
      : ledger.event_type,
    source_type: ledger.source_type,
    source_id: ledger.source_id,
    source_no: ledger.source_no,
    source_label: ledger.source_type === "tenant_subscription_invoice"
      ? `系统使用费账单 ${ledger.source_id || ""}`.trim()
      : [ledger.source_type, ledger.source_no || ledger.source_id]
        .filter(Boolean)
        .join(" / ") || null,
    remark: ledger.remark,
    created_at: ledger.created_at,
  };
}

function buildPaymentHint(invoice: TenantSubscriptionInvoiceRecord) {
  if (!PAYABLE_INVOICE_STATUSES.has(invoice.status)) {
    return null;
  }

  return {
    required_credits: Number(invoice.amount_credits || 0),
    action_label: "去充值",
    message: "充值到账后，系统会自动优先补扣这笔系统使用费。",
  };
}

export const billingSubscriptionService = new BillingSubscriptionService();
