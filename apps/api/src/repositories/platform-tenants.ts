import { Errors } from "@/errors/error-factory";
import type {
  CreatePlatformTenantInput,
  PlatformTenantListQuery,
  PlatformTenantStatus,
  UpdatePlatformTenantInput,
} from "@/schema/platform-tenants";
import { SupabaseDB } from "@/utils/supabase";

export type PlatformTenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: PlatformTenantStatus;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformTenantUsageStats = {
  employee_count: number;
  customer_count: number;
  project_count: number;
  h5_page_count: number;
  camera_count: number;
};

const EMPTY_USAGE: PlatformTenantUsageStats = {
  employee_count: 0,
  customer_count: 0,
  project_count: 0,
  h5_page_count: 0,
  camera_count: 0,
};

type UsageTableKey = keyof PlatformTenantUsageStats;

const USAGE_TABLES: Array<{ table: string; key: UsageTableKey }> = [
  { table: "employees", key: "employee_count" },
  { table: "customers", key: "customer_count" },
  { table: "projects", key: "project_count" },
  { table: "marketing_pages", key: "h5_page_count" },
  { table: "project_cameras", key: "camera_count" },
];

class PlatformTenantRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async list(query: PlatformTenantListQuery) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let request = this.from("tenants")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.keyword) {
      const keyword = query.keyword.replace(/[,()]/g, " ").trim();
      if (keyword) {
        request = request.or(
          `name.ilike.%${keyword}%,slug.ilike.%${keyword}%,contact_name.ilike.%${keyword}%,contact_phone.ilike.%${keyword}%`,
        );
      }
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询租户列表失败", error);
    }

    const records = (data || []) as PlatformTenantRecord[];
    const usageMap = await this.getUsageStats(records.map((item) => item.id));

    return {
      list: records.map((item) => ({
        ...item,
        usage: usageMap.get(item.id) ?? { ...EMPTY_USAGE },
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async findById(id: string) {
    const { data, error } = await this.from("tenants")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户失败", error);
    }

    return (data || null) as PlatformTenantRecord | null;
  }

  async findBySlug(slug: string) {
    const { data, error } = await this.from("tenants")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户标识失败", error);
    }

    return (data || null) as PlatformTenantRecord | null;
  }

  async create(input: CreatePlatformTenantInput) {
    const { data, error } = await this.from("tenants")
      .insert({
        name: input.name,
        slug: input.slug,
        status: input.status,
        contact_name: input.contact_name ?? null,
        contact_phone: input.contact_phone ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建租户失败", error);
    }

    return data as PlatformTenantRecord;
  }

  async update(id: string, input: UpdatePlatformTenantInput) {
    const { data, error } = await this.from("tenants")
      .update({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.contact_name !== undefined ? { contact_name: input.contact_name ?? null } : {}),
        ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone ?? null } : {}),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新租户失败", error);
    }

    return (data || null) as PlatformTenantRecord | null;
  }

  async updateStatus(id: string, status: Exclude<PlatformTenantStatus, "archived">) {
    const { data, error } = await this.from("tenants")
      .update({ status })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新租户状态失败", error);
    }

    return (data || null) as PlatformTenantRecord | null;
  }

  async getUsageStats(tenantIds: string[]) {
    const uniqueTenantIds = Array.from(new Set(tenantIds.filter(Boolean)));
    const result = new Map<string, PlatformTenantUsageStats>();

    for (const tenantId of uniqueTenantIds) {
      result.set(tenantId, { ...EMPTY_USAGE });
    }

    if (uniqueTenantIds.length === 0) {
      return result;
    }

    await Promise.all(
      uniqueTenantIds.flatMap((tenantId) =>
        USAGE_TABLES.map(async ({ table, key }) => {
          const { count, error } = await this.from(table)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId);

          if (error) {
            throw Errors.dbError("查询租户用量统计失败", { table, error });
          }

          const usage = result.get(tenantId);
          if (usage) {
            usage[key] = count || 0;
          }
        })
      ),
    );

    return result;
  }
}

export const platformTenantRepository = new PlatformTenantRepository();
