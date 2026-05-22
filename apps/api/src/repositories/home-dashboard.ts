import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const ACTIVE_PROJECT_STATUSES = [
  "designing",
  "proposal_confirmed",
  "signed",
  "design_finalized",
  "pending_start",
  "started",
  "constructing",
  "on_hold",
  "acceptance",
];

type CustomerRelation = { name: string | null } | Array<{ name: string | null }> | null;
type PropertyRelation = { community: string | null } | Array<{ community: string | null }> | null;

function getRelationValue<T extends Record<string, unknown>, K extends keyof T>(
  value: T | T[] | null | undefined,
  key: K,
) {
  const record = Array.isArray(value) ? value[0] : value;
  return record?.[key] ?? null;
}

class HomeDashboardRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async countActiveProjects(tenantId: string) {
    const { count, error } = await this.adminClient
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ACTIVE_PROJECT_STATUSES);

    if (error) {
      throw Errors.dbError("查询在建项目统计失败", error);
    }

    return count || 0;
  }

  async countCustomers(tenantId: string) {
    const { count, error } = await this.adminClient
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if (error) {
      throw Errors.dbError("查询客户统计失败", error);
    }

    return count || 0;
  }

  async sumMonthRevenue(tenantId: string, monthStart: string, nextMonthStart: string) {
    const { data, error } = await this.adminClient
      .from("payments")
      .select(`
        amount,
        type,
        status,
        pay_date,
        project:projects!inner(tenant_id)
      `)
      .eq("status", "confirmed")
      .eq("project.tenant_id", tenantId)
      .gte("pay_date", monthStart)
      .lt("pay_date", nextMonthStart);

    if (error) {
      throw Errors.dbError("查询本月营收失败", error);
    }

    return (data || []).reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      if (!Number.isFinite(amount)) {
        return sum;
      }

      return item.type === "refund" ? sum - amount : sum + amount;
    }, 0);
  }

  async listLatestCustomers(tenantId: string) {
    const { data, error } = await this.adminClient
      .from("customers")
      .select(`
        id,
        name,
        phone,
        status,
        created_at,
        owner:employees!customers_owner_id_fkey(name)
      `)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      throw Errors.dbError("查询最新客户失败", error);
    }

    return (data || []).map((item) => ({
      id: item.id,
      name: item.name,
      phone: item.phone,
      status: item.status,
      created_at: item.created_at,
      owner_name: getRelationValue(item.owner as CustomerRelation, "name"),
    }));
  }

  async listLatestProjects(tenantId: string) {
    const { data, error } = await this.adminClient
      .from("projects")
      .select(`
        id,
        name,
        budget,
        status,
        created_at,
        customer:customers!projects_customer_id_fkey(name),
        property:properties!projects_property_id_fkey(community)
      `)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      throw Errors.dbError("查询最新项目失败", error);
    }

    return (data || []).map((item) => ({
      id: item.id,
      name: item.name,
      budget: item.budget,
      status: item.status,
      created_at: item.created_at,
      customer_name: getRelationValue(item.customer as CustomerRelation, "name"),
      community: getRelationValue(item.property as PropertyRelation, "community"),
    }));
  }
}

export const homeDashboardRepository = new HomeDashboardRepository();
