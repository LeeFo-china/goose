import { Errors } from "@/errors/error-factory";
import {
  serializeDouyinCustomerSourceMetadata,
  type DouyinCustomerSourceMetadata,
} from "@/repositories/customer-source-douyin-metadata";
import {
  parseCustomerSourceSummaryRows,
  type CustomerSourceRawRecord,
  type CustomerSourceSummaryRecord,
} from "@/repositories/customer-source-summary-parser";
import type { CustomerSourceListQuery } from "@/schema/customer-sources";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerSourceRecord = CustomerSourceRawRecord;

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

export type SerializedCustomerSource = {
  id: string;
  source: string;
  source_label: string | null;
  assigned_at: string | null;
  created_at: string;
  metadata: unknown | DouyinCustomerSourceMetadata;
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

export type SerializedCustomerSourceSummary = Omit<
  CustomerSourceSummaryRecord,
  "latestSource"
> & {
  latestSource: SerializedCustomerSource | null;
};

const CUSTOMER_SOURCE_SELECT = [
  "id",
  "tenant_id",
  "customer_id",
  "source",
  "source_label",
  "platform_lead_id",
  "assigned_by_employee_id",
  "assigned_at",
  "metadata",
  "created_at",
  "source_employee_id",
  "related_type",
  "related_id",
  "share_link_id",
  "marketing_lead_id",
  "douyin_measurement_appointment_id",
].join(",");

export class CustomerSourceRepository {
  private client;

  constructor(client = SupabaseDB.getAdminClient()) {
    this.client = client;
  }

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async findCustomerAccess(input: {
    customerId: string;
    tenantId: string;
  }) {
    const { data, error } = await this.from("customers")
      .select("id, owner_id, tenant_id")
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    return (data || null) as CustomerAccessRecord | null;
  }

  async listByCustomer(input: {
    tenantId: string;
    customerId: string;
    query: CustomerSourceListQuery;
  }) {
    const from = (input.query.page - 1) * input.query.pageSize;
    const to = from + input.query.pageSize - 1;

    const request = this.from("customer_sources")
      .select(CUSTOMER_SOURCE_SELECT, { count: "exact" })
      .eq("customer_id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询客户来源时间线失败", error);
    }

    const list = await this.serializeRows(
      (data || []) as CustomerSourceRecord[],
      input.tenantId,
    );
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
    tenantId: string;
    customerIds: string[];
  }) {
    if (input.customerIds.length === 0) {
      return [] as SerializedCustomerSourceSummary[];
    }
    if (
      input.customerIds.length > 100
      || new Set(input.customerIds).size !== input.customerIds.length
    ) {
      throw Errors.badRequest("客户来源摘要最多支持 100 个不重复客户");
    }

    const { data, error } = await this.client.rpc("list_customer_source_summaries", {
      p_tenant_id: input.tenantId,
      p_customer_ids: input.customerIds,
    });
    if (error) {
      throw Errors.dbError("查询客户来源摘要失败");
    }

    const rows = parseCustomerSourceSummaryRows(data, input);
    if (!rows) {
      throw Errors.dbError("查询客户来源摘要失败", {
        code: "CUSTOMER_SOURCE_SUMMARY_INVALID_RESPONSE",
      });
    }

    const latestRows = rows.flatMap((row) => row.latestSource ? [row.latestSource] : []);
    const serializedLatestRows = await this.serializeRows(latestRows, input.tenantId);
    let latestIndex = 0;

    return rows.map((row): SerializedCustomerSourceSummary => ({
      ...row,
      latestSource: row.latestSource ? serializedLatestRows[latestIndex++]! : null,
    }));
  }

  private async serializeRows(rows: CustomerSourceRecord[], tenantId: string) {
    if (rows.length === 0) {
      return [] as SerializedCustomerSource[];
    }

    const sourceEmployeeIds = unique(rows.map((item) => item.source_employee_id));
    const assignedEmployeeIds = unique(rows.map((item) => item.assigned_by_employee_id));
    const platformLeadIds = unique(rows.map((item) => item.platform_lead_id));
    const shareLinkIds = unique(rows.map((item) => item.share_link_id));

    const [sourceEmployees, assignedEmployees, platformLeads, shareLinks] = await Promise.all([
      this.findEmployees(sourceEmployeeIds, tenantId),
      this.findEmployees(assignedEmployeeIds, tenantId),
      this.findPlatformLeads(platformLeadIds),
      this.findShareLinks(shareLinkIds, tenantId),
    ]);

    return rows.map((row): SerializedCustomerSource => {
      const dedupeResult = readDedupeResult(row.metadata);
      return {
        id: row.id,
        source: isDouyinAppointmentSource(row) ? "douyin" : row.source,
        source_label: isDouyinAppointmentSource(row)
          ? "抖音小程序"
          : row.source_label,
        metadata: isDouyinAppointmentSource(row)
          ? serializeDouyinCustomerSourceMetadata(row.metadata)
          : row.metadata,
        display_label: isDouyinAppointmentSource(row)
          ? "抖音小程序"
          : row.source_label || getSourceLabel(row.source),
        dedupe_result: dedupeResult,
        assigned_at: row.assigned_at,
        created_at: row.created_at,
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

  private async findEmployees(
    ids: string[],
    tenantId: string,
  ): Promise<Map<string, EmployeeLite>> {
    if (ids.length === 0) return new Map<string, EmployeeLite>();

    const { data, error } = await this.from("employees")
      .select("id,name,phone")
      .in("id", ids)
      .eq("tenant_id", tenantId);

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

  private async findShareLinks(
    ids: string[],
    tenantId: string,
  ): Promise<Map<string, TenantShareLinkLite>> {
    if (ids.length === 0) return new Map<string, TenantShareLinkLite>();

    const { data, error } = await this.from("tenant_share_links")
      .select("id,token,source,target_type,target_id")
      .in("id", ids)
      .eq("tenant_id", tenantId);

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

function isDouyinAppointmentSource(row: CustomerSourceRecord) {
  return row.source === "douyin_miniapp";
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
    case "douyin_miniapp":
      return "抖音小程序";
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
