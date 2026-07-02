import { Errors } from "@/errors/error-factory";
import type {
  CreditRechargeProductRecord,
  TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";
import { SupabaseDB } from "@/utils/supabase/index";

export type PlatformRechargeProductCreateRecordInput = {
  code: string;
  title: string;
  amount_fen: number;
  credits: number;
  bonus_credits: number;
  enabled: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_by_employee_id: string;
  updated_by_employee_id: string;
};

export type PlatformRechargeProductUpdateRecordInput = Partial<
  Omit<PlatformRechargeProductCreateRecordInput, "created_by_employee_id">
> & {
  updated_by_employee_id: string;
};

export type PlatformBillingRechargeOrderListItem = TenantCreditOrderRecord & {
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
  } | null;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedClient = {
  from: (
    table: "platform_credit_recharge_products" | "tenant_credit_orders",
  ) => UntypedTable;
};

class PlatformBillingRechargeRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async listProducts(input: {
    page: number;
    pageSize: number;
    enabled?: boolean;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("platform_credit_recharge_products")
      .select("*", { count: "exact" })
      .order("sort_order", { ascending: true })
      .order("amount_fen", { ascending: true })
      .range(from, to);

    if (input.enabled !== undefined) {
      request = request.eq("enabled", input.enabled);
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询平台积分充值套餐失败", error);
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

  async createProduct(input: PlatformRechargeProductCreateRecordInput) {
    const { data, error } = await this.from("platform_credit_recharge_products")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建平台积分充值套餐失败", error);
    }

    return data as CreditRechargeProductRecord;
  }

  async updateProduct(
    productId: string,
    input: PlatformRechargeProductUpdateRecordInput,
  ) {
    const { data, error } = await this.from("platform_credit_recharge_products")
      .update(input)
      .eq("id", productId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新平台积分充值套餐失败", error);
    }

    return data as CreditRechargeProductRecord;
  }

  async listOrders(input: {
    page: number;
    pageSize: number;
    status?: string;
    keyword?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("tenant_credit_orders")
      .select(
        [
          "*",
          "tenant:tenants!tenant_credit_orders_tenant_id_fkey(id, name, slug)",
        ].join(", "),
        { count: "exact" },
      )
      .eq("channel", "wechat_pay")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.status) request = request.eq("status", input.status);
    if (input.keyword) {
      const escaped = input.keyword.replaceAll(",", "\\,");
      request = request.or(
        `order_no.ilike.%${escaped}%,out_trade_no.ilike.%${escaped}%,transaction_id.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询平台积分充值订单失败", error);
    }

    return {
      list: (data ?? []) as PlatformBillingRechargeOrderListItem[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }
}

export const platformBillingRechargeRepository =
  new PlatformBillingRechargeRepository();
