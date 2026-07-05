import { Errors } from "./shared";
import type {
  BillingAccountBalance,
  BillingLedgerRow,
  BillingManualRechargeInput,
  BillingTenantListQuery,
  BillingTenantLite,
} from "./shared";

export async function ensureAccount(this: any, tenantId: string) {
  const { data, error } = await this.rpc("billing_ensure_account", {
    p_tenant_id: tenantId,
  });

  if (error) {
    throw Errors.dbError("初始化租户积分账户失败", error);
  }

  if (!data || typeof data !== "object" || !("account" in data)) {
    throw Errors.dbError("初始化租户积分账户返回格式异常", {
      reason: "missing_account",
    });
  }

  return (data as { account: BillingAccountBalance }).account;
}

export async function getAccountByTenantId(this: any, tenantId: string) {
  const { data, error } = await this.from("tenant_credit_account_balances")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询租户积分账户失败", error);
  }

  return data as BillingAccountBalance | null;
}

export async function listAccountsByTenantIds(this: any, tenantIds: string[]) {
  if (!tenantIds.length) return [] as BillingAccountBalance[];

  const { data, error } = await this.from("tenant_credit_account_balances")
    .select("*")
    .in("tenant_id", tenantIds);

  if (error) {
    throw Errors.dbError("查询租户积分账户失败", error);
  }

  return (data || []) as BillingAccountBalance[];
}

export async function listTenantCandidates(this: any, query: BillingTenantListQuery) {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let request = this.from("tenants")
    .select("id, name, slug, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (query.keyword) {
    const escaped = query.keyword.replaceAll(",", "\\,");
    request = request.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }

  const { data, count, error } = await request;
  if (error) {
    throw Errors.dbError("查询计费租户列表失败", error);
  }

  return {
    list: (data || []) as BillingTenantLite[],
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / query.pageSize) : 0,
    },
  };
}

export async function listTenantIdsByKeyword(this: any, keyword: string) {
  const escaped = keyword.replaceAll(",", "\\,");
  const { data, error } = await this.from("tenants")
    .select("id")
    .or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`)
    .limit(500);

  if (error) {
    throw Errors.dbError("查询租户筛选条件失败", error);
  }

  return (data || []).map((item: { id: string }) => item.id);
}

export async function listTenantsByIds(this: any, tenantIds: string[]) {
  if (!tenantIds.length) return [] as BillingTenantLite[];

  const { data, error } = await this.from("tenants")
    .select("id, name, slug, status")
    .in("id", tenantIds);

  if (error) {
    throw Errors.dbError("查询租户信息失败", error);
  }

  return (data || []) as BillingTenantLite[];
}

export async function countTenants(this: any, ) {
  const { count, error } = await this.from("tenants")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw Errors.dbError("统计租户数量失败", error);
  }

  return count || 0;
}

export async function listAllAccounts(this: any, ) {
  const { data, error } = await this.from("tenant_credit_account_balances")
    .select("*");

  if (error) {
    throw Errors.dbError("查询平台积分账户汇总失败", error);
  }

  return (data || []) as BillingAccountBalance[];
}

export async function manualRecharge(this: any, 
  tenantId: string,
  input: BillingManualRechargeInput,
  operatorUserId: string | null,
) {
  const { data, error } = await this.rpc("billing_manual_recharge", {
    p_tenant_id: tenantId,
    p_amount_fen: input.amount_fen,
    p_credits: input.credits,
    p_bonus_credits: input.bonus_credits || 0,
    p_operator_user_id: operatorUserId,
    p_remark: input.remark || null,
    p_metadata: {},
    p_idempotency_key: input.idempotency_key || null,
  });

  if (error) {
    throw Errors.dbError("人工充值失败", error);
  }

  return data as {
    order: Record<string, unknown>;
    account: BillingAccountBalance;
    ledger: BillingLedgerRow;
    idempotent: boolean;
  };
}
