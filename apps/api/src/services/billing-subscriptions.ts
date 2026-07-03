import {
  billingSubscriptionRepository,
  type BillingSubscriptionRpcResult,
  type TenantBillingSubscriptionLockState,
  type TenantSubscriptionInvoiceRecord,
} from "@/repositories/billing-subscriptions";

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

export const billingSubscriptionService = new BillingSubscriptionService();
