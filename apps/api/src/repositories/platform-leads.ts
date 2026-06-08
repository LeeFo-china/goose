import { Errors } from "@/errors/error-factory";
import type {
  PlatformLeadListQuery,
  PlatformLeadStatus,
  PlatformLeadSubmitInput,
} from "@/schema/platform-leads";
import { SupabaseDB } from "@/utils/supabase";

export type PlatformLeadRecord = {
  id: string;
  auth_user_id: string | null;
  phone: string;
  name: string | null;
  city: string | null;
  community: string | null;
  area: number | null;
  budget: string | null;
  description: string | null;
  source: string;
  tenant_id: string | null;
  project_id: string | null;
  source_context: unknown;
  status: PlatformLeadStatus;
  assigned_tenant_id: string | null;
  assigned_customer_id: string | null;
  assigned_by_employee_id: string | null;
  assigned_at: string | null;
  assigned_note: string | null;
  created_at: string;
  updated_at: string;
};

type TenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

type CustomerLite = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  source: string | null;
};

type EmployeeLite = {
  id: string;
  name: string | null;
  phone: string | null;
};

type PlatformLeadAssignLogRecord = {
  id: string;
  platform_lead_id: string;
  target_tenant_id: string | null;
  assigned_customer_id: string | null;
  action: string;
  dedupe_result: string | null;
  operator_employee_id: string | null;
  note: string | null;
  created_at: string;
};

type CustomerSourceRecord = {
  id: string;
  tenant_id: string;
  customer_id: string;
  source: string;
  source_label: string | null;
  platform_lead_id: string | null;
  assigned_by_employee_id: string | null;
  assigned_at: string | null;
  metadata: unknown;
  created_at: string;
};

export type PlatformLeadAssignResult = {
  platform_lead_id: string;
  assigned_tenant_id: string;
  assigned_customer_id: string;
  dedupe_result: "existing_customer" | "created_customer" | "already_assigned";
  status: "assigned";
};

class PlatformLeadRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async create(input: PlatformLeadSubmitInput & { authUserId: string }) {
    const { data, error } = await this.from("platform_leads")
      .insert({
        auth_user_id: input.authUserId,
        phone: input.phone,
        name: input.name ?? null,
        city: input.city ?? null,
        community: input.community ?? null,
        area: input.area ?? null,
        budget: input.budget ?? null,
        description: input.description ?? null,
        source: input.source,
        tenant_id: input.tenant_id ?? null,
        project_id: input.project_id ?? null,
        source_context: input.source_context ?? {},
        status: "new",
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建平台线索失败", error);
    }

    return data as PlatformLeadRecord;
  }

  async list(query: PlatformLeadListQuery) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let request = this.from("platform_leads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.phone) {
      request = request.ilike("phone", `%${query.phone}%`);
    }

    if (query.assigned_tenant_id) {
      request = request.eq("assigned_tenant_id", query.assigned_tenant_id);
    }

    if (query.keyword) {
      const keyword = query.keyword.replace(/[,()]/g, " ").trim();
      if (keyword) {
        request = request.or(
          `name.ilike.%${keyword}%,phone.ilike.%${keyword}%,city.ilike.%${keyword}%,community.ilike.%${keyword}%`,
        );
      }
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询平台线索列表失败", error);
    }

    const list = await this.hydrateLeads((data || []) as PlatformLeadRecord[]);

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

  async findById(id: string) {
    const { data, error } = await this.from("platform_leads")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询平台线索失败", error);
    }

    return (data || null) as PlatformLeadRecord | null;
  }

  async getDetail(id: string) {
    const record = await this.findById(id);
    if (!record) {
      return null;
    }

    const [hydrated] = await this.hydrateLeads([record]);
    const [logs, sources] = await Promise.all([
      this.listAssignLogs(id),
      this.listCustomerSources(id),
    ]);

    return {
      ...hydrated,
      assign_logs: logs,
      customer_sources: sources,
    };
  }

  async assign(input: {
    leadId: string;
    tenantId: string;
    operatorEmployeeId: string;
    assignedNote?: string | null;
  }) {
    const { data, error } = await this.client.rpc("assign_platform_lead", {
      p_lead_id: input.leadId,
      p_tenant_id: input.tenantId,
      p_operator_employee_id: input.operatorEmployeeId,
      p_assigned_note: input.assignedNote ?? null,
    });

    if (error) {
      throw error;
    }

    return data as PlatformLeadAssignResult;
  }

  private async hydrateLeads(records: PlatformLeadRecord[]) {
    if (records.length === 0) return [];

    const tenantIds = unique(records.map((item) => item.assigned_tenant_id));
    const customerIds = unique(records.map((item) => item.assigned_customer_id));
    const employeeIds = unique(records.map((item) => item.assigned_by_employee_id));

    const [tenants, customers, employees] = await Promise.all([
      this.findTenants(tenantIds),
      this.findCustomers(customerIds),
      this.findEmployees(employeeIds),
    ]);

    return records.map((item) => ({
      ...item,
      assigned_tenant: item.assigned_tenant_id
        ? tenants.get(item.assigned_tenant_id) ?? null
        : null,
      assigned_customer: item.assigned_customer_id
        ? customers.get(item.assigned_customer_id) ?? null
        : null,
      assigned_by: item.assigned_by_employee_id
        ? employees.get(item.assigned_by_employee_id) ?? null
        : null,
    }));
  }

  private async findTenants(ids: string[]) {
    if (ids.length === 0) return new Map<string, TenantLite>();

    const { data, error } = await this.from("tenants")
      .select("id,name,slug,status")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询线索租户信息失败", error);
    }

    return new Map((data || []).map((item: TenantLite) => [item.id, item]));
  }

  private async findCustomers(ids: string[]) {
    if (ids.length === 0) return new Map<string, CustomerLite>();

    const { data, error } = await this.from("customers")
      .select("id,name,phone,status,source")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询线索客户信息失败", error);
    }

    return new Map((data || []).map((item: CustomerLite) => [item.id, item]));
  }

  private async findEmployees(ids: string[]) {
    if (ids.length === 0) return new Map<string, EmployeeLite>();

    const { data, error } = await this.from("employees")
      .select("id,name,phone")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询线索操作人失败", error);
    }

    return new Map((data || []).map((item: EmployeeLite) => [item.id, item]));
  }

  private async listAssignLogs(platformLeadId: string) {
    const { data, error } = await this.from("platform_lead_assign_logs")
      .select("*")
      .eq("platform_lead_id", platformLeadId)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询平台线索分配日志失败", error);
    }

    const logs = (data || []) as PlatformLeadAssignLogRecord[];
    const [tenants, customers, employees] = await Promise.all([
      this.findTenants(unique(logs.map((item) => item.target_tenant_id))),
      this.findCustomers(unique(logs.map((item) => item.assigned_customer_id))),
      this.findEmployees(unique(logs.map((item) => item.operator_employee_id))),
    ]);

    return logs.map((item) => ({
      ...item,
      target_tenant: item.target_tenant_id
        ? tenants.get(item.target_tenant_id) ?? null
        : null,
      assigned_customer: item.assigned_customer_id
        ? customers.get(item.assigned_customer_id) ?? null
        : null,
      operator: item.operator_employee_id
        ? employees.get(item.operator_employee_id) ?? null
        : null,
    }));
  }

  private async listCustomerSources(platformLeadId: string) {
    const { data, error } = await this.from("customer_sources")
      .select("*")
      .eq("platform_lead_id", platformLeadId)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户来源记录失败", error);
    }

    return (data || []) as CustomerSourceRecord[];
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((item): item is string => Boolean(item))));
}

export const platformLeadRepository = new PlatformLeadRepository();
