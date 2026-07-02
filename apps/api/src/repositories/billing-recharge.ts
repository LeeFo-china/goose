import { Errors } from "@/errors/error-factory";
import type { BillingAccountBalance } from "@/repositories/billing";
import { SupabaseDB } from "@/utils/supabase/index";

export type CreditRechargeProductRecord = {
  id: string;
  code: string;
  title: string;
  amount_fen: number;
  credits: number;
  bonus_credits: number;
  enabled: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantCreditOrderRecord = {
  id: string;
  tenant_id: string;
  order_no: string;
  idempotency_key: string | null;
  package_code: string | null;
  credits: number;
  amount_fen: number;
  bonus_credits: number;
  channel: "manual" | "wechat_pay" | "alipay" | "bank_transfer";
  status: "pending" | "paid" | "closed" | "refunded";
  paid_at: string | null;
  created_by: string | null;
  remark: string | null;
  metadata: Record<string, unknown>;
  payment_config_id: string | null;
  out_trade_no: string | null;
  prepay_id: string | null;
  transaction_id: string | null;
  paid_amount_fen: number;
  closed_at: string | null;
  latest_notification_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantCreditOrderCreateInput = {
  tenant_id: string;
  order_no: string;
  out_trade_no: string;
  idempotency_key: string | null;
  package_code: string;
  credits: number;
  bonus_credits: number;
  amount_fen: number;
  channel: "wechat_pay";
  status: "pending";
  created_by: string;
  payment_config_id: string;
  metadata: Record<string, unknown>;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
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
      | "platform_credit_recharge_products"
      | "tenant_credit_orders"
      | "tenant_credit_account_balances",
  ) => UntypedTable;
};

class BillingRechargeRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async listEnabledProducts(input: { page: number; pageSize: number }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const { data, error, count } = await this.from("platform_credit_recharge_products")
      .select("*", { count: "exact" })
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .order("amount_fen", { ascending: true })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询积分充值套餐失败", error);
    }

    return {
      list: (data ?? []) as CreditRechargeProductRecord[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async findEnabledProductByCode(code: string) {
    const { data, error } = await this.from("platform_credit_recharge_products")
      .select("*")
      .eq("code", code)
      .eq("enabled", true)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值套餐失败", error);
    }

    return (data as CreditRechargeProductRecord | null) ?? null;
  }

  async findOrderByIdempotencyKey(input: {
    tenantId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值订单失败", error);
    }

    return (data as TenantCreditOrderRecord | null) ?? null;
  }

  async createOrder(input: TenantCreditOrderCreateInput) {
    const { data, error } = await this.from("tenant_credit_orders")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建积分充值订单失败", error);
    }

    return data as TenantCreditOrderRecord;
  }

  async markPrepayCreated(input: {
    tenantId: string;
    orderId: string;
    prepayId: string;
  }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .update({ prepay_id: input.prepayId })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存积分充值预支付单失败", error);
    }

    return data as TenantCreditOrderRecord;
  }

  async findOrderById(input: { tenantId: string; orderId: string }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值订单失败", error);
    }

    return (data as TenantCreditOrderRecord | null) ?? null;
  }

  async getAccountByTenantId(tenantId: string) {
    const { data, error } = await this.from("tenant_credit_account_balances")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户积分账户失败", error);
    }

    return (data as BillingAccountBalance | null) ?? null;
  }
}

export const billingRechargeRepository = new BillingRechargeRepository();
