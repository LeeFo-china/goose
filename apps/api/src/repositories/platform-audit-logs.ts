import { Errors } from "@/errors/error-factory";
import type {
  PlatformAuditLogAction,
  PlatformAuditLogListQuery,
  PlatformAuditLogStatus,
} from "@/schema/platform-audit-logs";
import { SupabaseDB } from "@/utils/supabase";

type TenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type EmployeeLite = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type PlatformAuditLogRecord = {
  id: string;
  action: PlatformAuditLogAction | string;
  actor_employee_id: string | null;
  actor_user_id: string | null;
  target_tenant_id: string | null;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  status: PlatformAuditLogStatus | string;
  summary: string | null;
  metadata: unknown;
  created_at: string;
};

export type PlatformAuditLogCreateInput = {
  action: PlatformAuditLogAction;
  actorEmployeeId?: string | null;
  actorUserId?: string | null;
  targetTenantId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  status?: PlatformAuditLogStatus;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};

export type PlatformReleaseDispatchAuditRecord = Pick<
  PlatformAuditLogRecord,
  "id" | "actor_employee_id" | "actor_user_id" | "resource_label" | "status" | "summary" | "metadata" | "created_at"
> & {
  actor_employee: EmployeeLite | null;
};

type PlatformAuditFilterRequest<Request> = {
  eq(column: string, value: string): Request;
  or(filters: string): Request;
};

export function applyPlatformAuditLogFilters<T extends PlatformAuditFilterRequest<T>>(
  initialRequest: T,
  query: PlatformAuditLogListQuery,
): T {
  let request = initialRequest;
  if (query.action) request = request.eq("action", query.action);
  if (query.status) request = request.eq("status", query.status);
  if (query.target_tenant_id) request = request.eq("target_tenant_id", query.target_tenant_id);
  if (query.resource_type) request = request.eq("resource_type", query.resource_type);
  if (query.resource_id) request = request.eq("resource_id", query.resource_id);
  if (query.keyword) {
    const keyword = query.keyword.replace(/[,()]/g, " ").trim();
    if (keyword) {
      request = request.or(
        `action.ilike.%${keyword}%,resource_type.ilike.%${keyword}%,resource_label.ilike.%${keyword}%,summary.ilike.%${keyword}%`,
      );
    }
  }
  return request;
}

class PlatformAuditLogRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async create(input: PlatformAuditLogCreateInput) {
    const { data, error } = await this.from("platform_audit_logs")
      .insert({
        action: input.action,
        actor_employee_id: input.actorEmployeeId ?? null,
        actor_user_id: input.actorUserId ?? null,
        target_tenant_id: input.targetTenantId ?? null,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        resource_label: input.resourceLabel ?? null,
        status: input.status ?? "success",
        summary: input.summary ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("写入平台审计日志失败", error);
    }

    return data as PlatformAuditLogRecord;
  }

  async list(query: PlatformAuditLogListQuery) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let request = this.from("platform_audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    request = applyPlatformAuditLogFilters(request, query);

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询平台审计日志失败", error);
    }

    const records = (data || []) as PlatformAuditLogRecord[];
    const list = await this.hydrate(records);

    return {
      list,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async listRecentReleaseDispatches(limit = 100): Promise<PlatformReleaseDispatchAuditRecord[]> {
    const { data, error } = await this.from("platform_audit_logs")
      .select("id,actor_employee_id,actor_user_id,resource_label,status,summary,metadata,created_at")
      .eq("action", "platform_release_dispatch")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw Errors.dbError("查询发布审计日志失败", error);
    }

    const records = (data || []) as Array<Omit<PlatformReleaseDispatchAuditRecord, "actor_employee">>;
    const employees = await this.findEmployees(unique(records.map((item) => item.actor_employee_id)));

    return records.map((item): PlatformReleaseDispatchAuditRecord => ({
      ...item,
      actor_employee: item.actor_employee_id
        ? (employees.get(item.actor_employee_id) as EmployeeLite | undefined) ?? null
        : null,
    }));
  }

  private async hydrate(records: PlatformAuditLogRecord[]) {
    if (records.length === 0) return [];

    const [tenants, employees] = await Promise.all([
      this.findTenants(unique(records.map((item) => item.target_tenant_id))),
      this.findEmployees(unique(records.map((item) => item.actor_employee_id))),
    ]);

    return records.map((item) => ({
      ...item,
      target_tenant: item.target_tenant_id
        ? tenants.get(item.target_tenant_id) ?? null
        : null,
      actor_employee: item.actor_employee_id
        ? employees.get(item.actor_employee_id) ?? null
        : null,
    }));
  }

  private async findTenants(ids: string[]) {
    if (ids.length === 0) return new Map<string, TenantLite>();

    const { data, error } = await this.from("tenants")
      .select("id,name,slug,status")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询审计日志租户信息失败", error);
    }

    return new Map((data || []).map((item: TenantLite) => [item.id, item]));
  }

  private async findEmployees(ids: string[]) {
    if (ids.length === 0) return new Map<string, EmployeeLite>();

    const { data, error } = await this.from("employees")
      .select("id,name,phone")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询审计日志操作人失败", error);
    }

    return new Map((data || []).map((item: EmployeeLite) => [item.id, item]));
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((item): item is string => Boolean(item))));
}

export const platformAuditLogRepository = new PlatformAuditLogRepository();
