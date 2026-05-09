import { Errors } from "@/errors/error-factory";
import type { CustomerSourceListQuery } from "@/schema/customer-sources";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerSourceRecord = {
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
  source_employee_id?: string | null;
  related_type?: string | null;
  related_id?: string | null;
  share_link_id?: string | null;
};

export type CustomerAccessRecord = {
  id: string;
  owner_id: string | null;
  tenant_id: string | null;
};

type EmployeeLite = {
  id: string;
  name: string | null;
  phone: string | null;
};

type PlatformLeadLite = {
  id: string;
  phone: string | null;
  name: string | null;
  city: string | null;
  community: string | null;
  status: string | null;
  source: string | null;
};

type TenantShareLinkLite = {
  id: string;
  token: string;
  source: string;
  target_type: string;
  target_id: string | null;
};

export type SerializedCustomerSource = CustomerSourceRecord & {
  display_label: string;
  dedupe_result: string | null;
  is_old_customer_new_lead: boolean;
  is_platform_new_lead: boolean;
  is_employee_share: boolean;
  source_employee: EmployeeLite | null;
  assigned_by: EmployeeLite | null;
  platform_lead: PlatformLeadLite | null;
  share_link: TenantShareLinkLite | null;
};

class CustomerSourceRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async findCustomerAccess(input: {
    customerId: string;
    tenantId: string | null;
  }) {
    let query = this.from("customers")
      .select("id, owner_id, tenant_id")
      .eq("id", input.customerId);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    return (data || null) as CustomerAccessRecord | null;
  }

  async listByCustomer(input: {
    tenantId: string | null;
    customerId: string;
    query: CustomerSourceListQuery;
  }) {
    const from = (input.query.page - 1) * input.query.pageSize;
    const to = from + input.query.pageSize - 1;

    let request = this.from("customer_sources")
      .select("*", { count: "exact" })
      .eq("customer_id", input.customerId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.tenantId) {
      request = request.eq("tenant_id", input.tenantId);
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询客户来源时间线失败", error);
    }

    const list = await this.serializeRows((data || []) as CustomerSourceRecord[]);
    return {
      list,
      pagination: {
        page: input.query.page,
        pageSize: input.query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.query.pageSize) : 0,
      },
    };
  }

  async listByCustomerIds(input: {
    tenantId: string | null;
    customerIds: string[];
  }) {
    if (input.customerIds.length === 0) {
      return [] as SerializedCustomerSource[];
    }

    let request = this.from("customer_sources")
      .select("*")
      .in("customer_id", input.customerIds)
      .order("created_at", { ascending: false });

    if (input.tenantId) {
      request = request.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await request;
    if (error) {
      throw Errors.dbError("查询客户来源摘要失败", error);
    }

    return this.serializeRows((data || []) as CustomerSourceRecord[]);
  }

  private async serializeRows(rows: CustomerSourceRecord[]) {
    if (rows.length === 0) {
      return [] as SerializedCustomerSource[];
    }

    const sourceEmployeeIds = unique(rows.map((item) => item.source_employee_id));
    const assignedEmployeeIds = unique(rows.map((item) => item.assigned_by_employee_id));
    const platformLeadIds = unique(rows.map((item) => item.platform_lead_id));
    const shareLinkIds = unique(rows.map((item) => item.share_link_id));

    const [sourceEmployees, assignedEmployees, platformLeads, shareLinks] = await Promise.all([
      this.findEmployees(sourceEmployeeIds),
      this.findEmployees(assignedEmployeeIds),
      this.findPlatformLeads(platformLeadIds),
      this.findShareLinks(shareLinkIds),
    ]);

    return rows.map((row): SerializedCustomerSource => {
      const dedupeResult = readDedupeResult(row.metadata);
      return {
        ...row,
        display_label: row.source_label || getSourceLabel(row.source),
        dedupe_result: dedupeResult,
        is_old_customer_new_lead: row.source === "platform_lead" && dedupeResult === "existing_customer",
        is_platform_new_lead: row.source === "platform_lead" && dedupeResult === "created_customer",
        is_employee_share: isEmployeeShareSource(row.source),
        source_employee: row.source_employee_id
          ? sourceEmployees.get(row.source_employee_id) ?? null
          : null,
        assigned_by: row.assigned_by_employee_id
          ? assignedEmployees.get(row.assigned_by_employee_id) ?? null
          : null,
        platform_lead: row.platform_lead_id
          ? platformLeads.get(row.platform_lead_id) ?? null
          : null,
        share_link: row.share_link_id
          ? shareLinks.get(row.share_link_id) ?? null
          : null,
      };
    });
  }

  private async findEmployees(ids: string[]): Promise<Map<string, EmployeeLite>> {
    if (ids.length === 0) return new Map<string, EmployeeLite>();

    const { data, error } = await this.from("employees")
      .select("id,name,phone")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询客户来源员工失败", error);
    }

    return new Map((data || []).map((item: EmployeeLite) => [item.id, item]));
  }

  private async findPlatformLeads(ids: string[]): Promise<Map<string, PlatformLeadLite>> {
    if (ids.length === 0) return new Map<string, PlatformLeadLite>();

    const { data, error } = await this.from("platform_leads")
      .select("id,phone,name,city,community,status,source")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询平台线索来源失败", error);
    }

    return new Map((data || []).map((item: PlatformLeadLite) => [item.id, item]));
  }

  private async findShareLinks(ids: string[]): Promise<Map<string, TenantShareLinkLite>> {
    if (ids.length === 0) return new Map<string, TenantShareLinkLite>();

    const { data, error } = await this.from("tenant_share_links")
      .select("id,token,source,target_type,target_id")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询分享链接来源失败", error);
    }

    return new Map((data || []).map((item: TenantShareLinkLite) => [item.id, item]));
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((item): item is string => Boolean(item))));
}

function readDedupeResult(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as { dedupe_result?: unknown }).dedupe_result;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isEmployeeShareSource(source: string) {
  return [
    "employee_share",
    "h5_campaign",
    "quote_form",
    "miniprogram_qrcode",
  ].includes(source);
}

function getSourceLabel(source: string) {
  switch (source) {
    case "platform_lead":
      return "平台分配线索";
    case "platform_assigned":
      return "平台分配客户";
    case "employee_share":
      return "员工拓客分享";
    case "h5_campaign":
      return "员工 H5 活动分享";
    case "quote_form":
      return "员工报价表单分享";
    case "miniprogram_qrcode":
      return "员工小程序码分享";
    case "douyin":
      return "抖音";
    case "referral":
      return "转介绍";
    case "walk_in":
      return "自然到店";
    case "telemarketing":
      return "电话销售";
    case "platform":
      return "平台";
    default:
      return source;
  }
}

export const customerSourceRepository = new CustomerSourceRepository();
