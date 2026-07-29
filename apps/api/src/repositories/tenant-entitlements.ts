import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type TenantEntitlementsQuery = PromiseLike<QueryResult> & {
  select(
    columns: string,
    options?: { count: "exact" },
  ): TenantEntitlementsQuery;
  eq(column: string, value: unknown): TenantEntitlementsQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): TenantEntitlementsQuery;
  range(from: number, to: number): TenantEntitlementsQuery;
  maybeSingle(): Promise<QueryResult>;
};

type TenantEntitlementsClient = {
  from(table: string): TenantEntitlementsQuery;
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<QueryResult>;
};

export type TenantEntitlementCode = "custom_support_branding";
export type TenantEntitlementAction = "grant" | "suspend" | "resume" | "revoke";

export type TenantEntitlementRecord = {
  id: string;
  tenant_id: string;
  entitlement_code: TenantEntitlementCode;
  status: "active" | "suspended" | "expired" | "revoked";
  starts_at: string;
  expires_at: string;
  source_type: "manual_grant" | "purchase";
  source_id: string | null;
  suspended_at: string | null;
  suspend_reason: string | null;
  version: number;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplyTenantEntitlementActionInput = {
  tenantId: string;
  entitlementCode: TenantEntitlementCode;
  action: TenantEntitlementAction;
  termYears: number | null;
  reason: string | null;
  expectedVersion: number;
  actorEmployeeId: string;
  actorUserId: string;
};

const TENANT_ENTITLEMENT_COLUMNS = [
  "id",
  "tenant_id",
  "entitlement_code",
  "status",
  "starts_at",
  "expires_at",
  "source_type",
  "source_id",
  "suspended_at",
  "suspend_reason",
  "version",
  "updated_by_employee_id",
  "created_at",
  "updated_at",
].join(",");

export class TenantEntitlementsRepository {
  constructor(
    private readonly getAdminClient: () => TenantEntitlementsClient = () =>
      SupabaseDB.getAdminClient() as unknown as TenantEntitlementsClient,
  ) {}

  async listByTenant(
    tenantId: string,
    pagination: { page: number; pageSize: number },
  ) {
    const from = (pagination.page - 1) * pagination.pageSize;
    const to = from + pagination.pageSize - 1;
    const { data, error, count } = await this.getAdminClient()
      .from("tenant_entitlements")
      .select(TENANT_ENTITLEMENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw Errors.dbError("查询租户权益失败", error);
    return {
      rows: (data ?? []) as TenantEntitlementRecord[],
      total: count ?? 0,
    };
  }

  async findByCode(
    tenantId: string,
    entitlementCode: TenantEntitlementCode,
  ) {
    const { data, error } = await this.getAdminClient()
      .from("tenant_entitlements")
      .select(TENANT_ENTITLEMENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("entitlement_code", entitlementCode)
      .maybeSingle();
    if (error) throw Errors.dbError("查询租户权益失败", error);
    return (data as TenantEntitlementRecord | null) ?? null;
  }

  async applyAction(input: ApplyTenantEntitlementActionInput) {
    const { data, error } = await this.getAdminClient().rpc(
      "apply_tenant_entitlement_action",
      {
        p_tenant_id: input.tenantId,
        p_entitlement_code: input.entitlementCode,
        p_action: input.action,
        p_term_years: input.termYears,
        p_reason: input.reason,
        p_expected_version: input.expectedVersion,
        p_actor_employee_id: input.actorEmployeeId,
        p_actor_user_id: input.actorUserId,
      },
    );
    if (error) throw Errors.dbError("执行租户权益操作失败", error);
    if (!data) throw Errors.dbError("执行租户权益操作失败");
    return data as TenantEntitlementRecord;
  }

  async expireIfDue(
    tenantId: string,
    entitlementCode: TenantEntitlementCode,
    now = new Date(),
  ) {
    const { data, error } = await this.getAdminClient().rpc(
      "expire_tenant_entitlement_if_due",
      {
        p_tenant_id: tenantId,
        p_entitlement_code: entitlementCode,
        p_now: now.toISOString(),
      },
    );
    if (error) throw Errors.dbError("同步租户权益到期状态失败", error);
    return (data as TenantEntitlementRecord | null) ?? null;
  }
}

export const tenantEntitlementsRepository =
  new TenantEntitlementsRepository();
