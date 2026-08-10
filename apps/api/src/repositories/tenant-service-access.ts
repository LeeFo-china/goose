import { Errors } from "@/errors/error-factory";
import type { TenantBillingSubscriptionStatus } from "@/repositories/billing-subscriptions";
import { SupabaseDB } from "@/utils/supabase/index";

export type TenantServiceContractAccessFact = {
  id: string;
  service_start_at: string;
  service_end_at: string;
};

export type TenantServicePaidOnboardingFact = {
  id: string;
  paid_at: string;
};

export type TenantServiceAccessFacts = {
  tenantStatus: string | null;
  contract: TenantServiceContractAccessFact | null;
  paidOnboardingOrder: TenantServicePaidOnboardingFact | null;
  legacySubscriptionStatus: TenantBillingSubscriptionStatus | null;
};

export type GetTenantServiceAccessFactsInput = {
  tenantId: string;
  now: Date;
};

export interface TenantServiceAccessRepositoryPort {
  getAccessFacts(
    input: GetTenantServiceAccessFactsInput,
  ): Promise<TenantServiceAccessFacts>;
}

type TableName =
  | "tenants"
  | "tenant_service_contracts"
  | "tenant_service_orders"
  | "tenant_billing_subscriptions";

type QueryResult = { data: unknown; error: unknown };

type UntypedTableQuery = {
  select: (columns: string) => UntypedTableQuery;
  eq: (column: string, value: unknown) => UntypedTableQuery;
  in: (column: string, values: readonly unknown[]) => UntypedTableQuery;
  not: (column: string, operator: string, value: unknown) => UntypedTableQuery;
  is: (column: string, value: unknown) => UntypedTableQuery;
  lte: (column: string, value: unknown) => UntypedTableQuery;
  gt: (column: string, value: unknown) => UntypedTableQuery;
  order: (
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ) => UntypedTableQuery;
  limit: (value: number) => UntypedTableQuery;
  then: Promise<QueryResult>["then"];
};

type UntypedClient = {
  from: (table: TableName) => UntypedTableQuery;
};

const PAID_ONBOARDING_PAYMENT_STATUSES = [
  "paid",
  "refund_reviewing",
  "refunding",
  "partially_refunded",
] as const;

export class TenantServiceAccessRepository
  implements TenantServiceAccessRepositoryPort {
  async getAccessFacts(
    input: GetTenantServiceAccessFactsInput,
  ): Promise<TenantServiceAccessFacts> {
    const nowIso = input.now.toISOString();

    let results: readonly [QueryResult, QueryResult, QueryResult, QueryResult];
    try {
      results = await Promise.all([
        this.from("tenants")
          .select("status")
          .eq("id", input.tenantId)
          .limit(1),
        this.from("tenant_service_contracts")
          .select("id,service_start_at,service_end_at")
          .eq("tenant_id", input.tenantId)
          .eq("service_family", "platform_technical_service")
          .eq("status", "active")
          .lte("service_start_at", nowIso)
          .gt("service_end_at", nowIso)
          .limit(1),
        this.from("tenant_service_orders")
          .select("id,paid_at")
          .eq("tenant_id", input.tenantId)
          .in("payment_status", PAID_ONBOARDING_PAYMENT_STATUSES)
          .not("service_status", "in", "(accepted,active)")
          .not("paid_at", "is", null)
          .is("service_access_terminated_at", null)
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .limit(1),
        this.from("tenant_billing_subscriptions")
          .select("status")
          .eq("tenant_id", input.tenantId)
          .limit(1),
      ]);
    } catch {
      throw Errors.dbError("查询租户服务访问事实失败");
    }

    if (results.some((result) => result.error)) {
      throw Errors.dbError("查询租户服务访问事实失败");
    }

    const [tenantResult, contractResult, orderResult, subscriptionResult] =
      results;
    const tenant = firstRow<{ status: string }>(tenantResult.data);
    const contract = firstRow<TenantServiceContractAccessFact>(
      contractResult.data,
    );
    const paidOnboardingOrder = parsePaidOnboardingFact(orderResult.data);
    const subscription = firstRow<{ status: TenantBillingSubscriptionStatus }>(
      subscriptionResult.data,
    );

    return {
      tenantStatus: tenant?.status ?? null,
      contract,
      paidOnboardingOrder,
      legacySubscriptionStatus: subscription?.status ?? null,
    };
  }

  private from(table: TableName) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }
}

export const tenantServiceAccessRepository =
  new TenantServiceAccessRepository();

function firstRow<T>(data: unknown): T | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0] as T;
}

function parsePaidOnboardingFact(
  data: unknown,
): TenantServicePaidOnboardingFact | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const row = data[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw Errors.dbError("查询租户服务访问事实失败");
  }

  const id = (row as Record<string, unknown>).id;
  const paidAt = (row as Record<string, unknown>).paid_at;
  if (
    typeof id !== "string"
    || id.trim() === ""
    || typeof paidAt !== "string"
    || paidAt.trim() === ""
    || !Number.isFinite(Date.parse(paidAt))
  ) {
    throw Errors.dbError("查询租户服务访问事实失败");
  }

  return { id, paid_at: paidAt };
}
