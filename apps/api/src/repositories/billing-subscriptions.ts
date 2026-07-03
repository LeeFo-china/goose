import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type TenantBillingSubscriptionStatus =
  | "active"
  | "past_due"
  | "locked"
  | "canceled";

export type TenantSubscriptionInvoiceStatus =
  | "upcoming"
  | "reminded"
  | "paid"
  | "past_due"
  | "failed"
  | "void";

export type TenantBillingSubscriptionRecord = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: TenantBillingSubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  next_charge_at: string;
  locked_at: string | null;
  lock_reason: string | null;
  last_invoice_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TenantSubscriptionInvoiceRecord = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  plan_id: string;
  period_start: string;
  period_end: string;
  due_at: string;
  amount_credits: number;
  status: TenantSubscriptionInvoiceStatus;
  reminder_due_at: string;
  reminded_at: string | null;
  paid_at: string | null;
  ledger_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BillingSubscriptionRpcResult = {
  charged?: boolean;
  recovered?: boolean;
  failure_code?: string | null;
  idempotent?: boolean;
  invoice?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  ledger_id?: string | null;
  reason?: string | null;
  [key: string]: unknown;
};

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 100;

export function normalizeSubscriptionPageRange(input: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number; from: number; to: number } {
  const pageCandidate = input.page;
  const pageSizeCandidate = input.pageSize;
  const page = typeof pageCandidate === "number" &&
      Number.isInteger(pageCandidate) &&
      pageCandidate > 0
    ? pageCandidate
    : DEFAULT_PAGE;
  const pageSize = typeof pageSizeCandidate === "number" &&
      Number.isInteger(pageSizeCandidate) &&
      pageSizeCandidate > 0
    ? Math.min(pageSizeCandidate, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}

export type TenantBillingSubscriptionLockRecord = Pick<
  TenantBillingSubscriptionRecord,
  "id" | "tenant_id" | "status" | "locked_at" | "lock_reason" | "last_invoice_id"
>;

export type TenantBillingSubscriptionLockState =
  | {
      locked: false;
      subscription: null;
    }
  | {
      locked: false;
      subscription: TenantBillingSubscriptionLockRecord;
    }
  | {
      locked: true;
      reason: string | null;
      locked_at: string | null;
      last_invoice_id: string | null;
      subscription: TenantBillingSubscriptionLockRecord;
    };

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  "in": (...args: unknown[]) => UntypedTable;
  lte: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedClient = {
  from: (
    table:
      | "tenant_billing_subscriptions"
      | "tenant_subscription_invoices",
  ) => UntypedTable;
  rpc: (
    functionName:
      | "billing_charge_subscription_invoice"
      | "billing_recover_subscription_after_recharge",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export class BillingSubscriptionRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  private rpc(
    functionName: Parameters<UntypedClient["rpc"]>[0],
    args: Record<string, unknown>,
  ) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).rpc(
      functionName,
      args,
    );
  }

  async findSubscriptionByTenantId(tenantId: string) {
    const { data, error } = await this.from("tenant_billing_subscriptions")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户订阅失败", error);
    }

    return (data as TenantBillingSubscriptionRecord | null) ?? null;
  }

  async getLockStateByTenantId(
    tenantId: string,
  ): Promise<TenantBillingSubscriptionLockState> {
    const { data, error } = await this.from("tenant_billing_subscriptions")
      .select("id, tenant_id, status, locked_at, lock_reason, last_invoice_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户订阅锁定状态失败", error);
    }

    const subscription =
      (data as TenantBillingSubscriptionLockRecord | null) ?? null;
    if (!subscription) {
      return { locked: false, subscription: null };
    }

    if (subscription.status !== "locked") {
      return { locked: false, subscription };
    }

    return {
      locked: true,
      reason: subscription.lock_reason,
      locked_at: subscription.locked_at,
      last_invoice_id: subscription.last_invoice_id,
      subscription,
    };
  }

  async listInvoicesDueForReminder(input: {
    nowIso: string;
    page?: number;
    pageSize?: number;
  }) {
    const { from, to } = normalizeSubscriptionPageRange(input);
    const { data, error } = await this.from("tenant_subscription_invoices")
      .select("*")
      .in("status", ["upcoming"])
      .lte("reminder_due_at", input.nowIso)
      .order("reminder_due_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询待提醒订阅账单失败", error);
    }

    return (data ?? []) as TenantSubscriptionInvoiceRecord[];
  }

  async listInvoicesDueForCharge(input: {
    nowIso: string;
    page?: number;
    pageSize?: number;
  }) {
    const { from, to } = normalizeSubscriptionPageRange(input);
    const { data, error } = await this.from("tenant_subscription_invoices")
      .select("*")
      .in("status", ["upcoming", "reminded"])
      .lte("due_at", input.nowIso)
      .order("due_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询待扣费订阅账单失败", error);
    }

    return (data ?? []) as TenantSubscriptionInvoiceRecord[];
  }

  async markInvoiceReminded(
    invoiceId: string,
  ): Promise<TenantSubscriptionInvoiceRecord | null> {
    const { data, error } = await this.from("tenant_subscription_invoices")
      .update({
        status: "reminded",
        reminded_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .eq("status", "upcoming")
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("标记订阅账单已提醒失败", error);
    }

    return (data as TenantSubscriptionInvoiceRecord | null) ?? null;
  }

  async chargeInvoice(input: {
    invoiceId: string;
    operatorUserId?: string | null;
  }) {
    const { data, error } = await this.rpc(
      "billing_charge_subscription_invoice",
      {
        p_invoice_id: input.invoiceId,
        p_operator_user_id: input.operatorUserId ?? null,
      },
    );

    if (error) {
      throw Errors.dbError("扣减订阅账单积分失败", error);
    }

    return data as BillingSubscriptionRpcResult;
  }

  async recoverAfterRecharge(tenantId: string) {
    const { data, error } = await this.rpc(
      "billing_recover_subscription_after_recharge",
      {
        p_tenant_id: tenantId,
      },
    );

    if (error) {
      throw Errors.dbError("充值后恢复租户订阅失败", error);
    }

    return data as BillingSubscriptionRpcResult;
  }
}

export const billingSubscriptionRepository = new BillingSubscriptionRepository();
