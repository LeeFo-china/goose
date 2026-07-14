import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type TenantBillingSubscriptionStatus = "active" | "past_due" | "locked" | "canceled";

export type TenantSubscriptionInvoiceStatus = "upcoming" | "reminded" | "paid" | "past_due" | "failed" | "void";

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

export type TenantBillingPlanRecord = {
  id: string;
  code: string;
  name: string;
  period: "monthly";
  monthly_fee_credits: number;
  reminder_days_before_due: number;
  enabled: boolean;
  version: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TenantSubscriptionLedgerRecord = {
  id: string;
  tenant_id: string;
  direction: "in" | "out" | "freeze" | "unfreeze";
  change_credits: number;
  balance_after: number;
  frozen_after: number;
  event_type: string;
  source_type: string | null;
  source_id: string | null;
  source_no: string | null;
  remark: string | null;
  created_at: string | null;
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

export type TenantSubscriptionInvoiceWithLedgerRecord =
  TenantSubscriptionInvoiceRecord & {
    ledger?: TenantSubscriptionLedgerRecord | null;
  };

export type TenantSubscriptionOpenInvoiceRecord = Pick<
  TenantSubscriptionInvoiceRecord,
  "id" | "tenant_id" | "amount_credits" | "due_at" | "status"
>;

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

export type BillingEnsureSubscriptionInvoicesResult = {
  created: number;
  scanned: number;
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
      | "tenant_billing_plans"
      | "tenant_billing_subscriptions"
      | "tenant_subscription_invoices",
  ) => UntypedTable;
  rpc: (
    functionName:
      | "billing_ensure_subscription_invoices"
      | "billing_charge_subscription_invoice"
      | "billing_recover_subscription_after_recharge",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const INVOICE_WITH_LEDGER_SELECT = `
  *,
  ledger:tenant_credit_ledger!tenant_subscription_invoices_ledger_id_fkey(
    id,
    tenant_id,
    direction,
    change_credits,
    balance_after,
    frozen_after,
    event_type,
    source_type,
    source_id,
    source_no,
    remark,
    created_at
  )
`;

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

  async findPlanById(planId: string) {
    const { data, error } = await this.from("tenant_billing_plans")
      .select("*")
      .eq("id", planId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户系统使用费方案失败", error);
    }

    return (data as TenantBillingPlanRecord | null) ?? null;
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

  async findOpenInvoiceByTenantId(
    tenantId: string,
  ): Promise<TenantSubscriptionOpenInvoiceRecord | null> {
    const { data, error } = await this.from("tenant_subscription_invoices")
      .select("id, tenant_id, amount_credits, due_at, status")
      .eq("tenant_id", tenantId)
      .in("status", ["reminded", "past_due", "failed"])
      .order("due_at", { ascending: true })
      .range(0, 0)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询待处理订阅账单失败", error);
    }

    return (data as TenantSubscriptionOpenInvoiceRecord | null) ?? null;
  }

  async findOpenInvoiceDetailByTenantId(
    tenantId: string,
  ): Promise<TenantSubscriptionInvoiceWithLedgerRecord | null> {
    const { data, error } = await this.from("tenant_subscription_invoices")
      .select(INVOICE_WITH_LEDGER_SELECT)
      .eq("tenant_id", tenantId)
      .in("status", ["reminded", "past_due", "failed"])
      .order("due_at", { ascending: true })
      .range(0, 0)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询待处理订阅账单详情失败", error);
    }

    return (data as TenantSubscriptionInvoiceWithLedgerRecord | null) ?? null;
  }

  async listInvoicesByTenantId(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    status?: TenantSubscriptionInvoiceStatus;
  }): Promise<{
    list: TenantSubscriptionInvoiceWithLedgerRecord[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page, pageSize, from, to } = normalizeSubscriptionPageRange(input);
    let request = this.from("tenant_subscription_invoices")
      .select(INVOICE_WITH_LEDGER_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("due_at", { ascending: false })
      .range(from, to);

    if (input.status) {
      request = request.eq("status", input.status);
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询租户系统使用费账单失败", error);
    }

    return {
      list: (data ?? []) as TenantSubscriptionInvoiceWithLedgerRecord[],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async findInvoiceByTenantId(input: {
    tenantId: string;
    invoiceId: string;
  }): Promise<TenantSubscriptionInvoiceWithLedgerRecord | null> {
    const { data, error } = await this.from("tenant_subscription_invoices")
      .select(INVOICE_WITH_LEDGER_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.invoiceId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户系统使用费账单详情失败", error);
    }

    return (data as TenantSubscriptionInvoiceWithLedgerRecord | null) ?? null;
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

  async ensureSubscriptionInvoices(input: {
    nowIso: string;
    batchSize?: number;
  }): Promise<BillingEnsureSubscriptionInvoicesResult> {
    const batchSize = normalizeSubscriptionPageRange({
      page: 1,
      pageSize: input.batchSize,
    }).pageSize;
    const { data, error } = await this.rpc(
      "billing_ensure_subscription_invoices",
      {
        p_now: input.nowIso,
        p_limit: batchSize,
      },
    );

    if (error) {
      throw Errors.dbError("补建订阅账单失败", error);
    }

    const payload = (data ?? {}) as Record<string, unknown>;

    return {
      created: toNonNegativeInteger(payload.created),
      scanned: toNonNegativeInteger(payload.scanned),
    };
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

function toNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

export const billingSubscriptionRepository = new BillingSubscriptionRepository();
