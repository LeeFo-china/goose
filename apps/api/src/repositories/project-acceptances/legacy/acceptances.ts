import { Errors, SupabaseDB } from "./shared";
import type { ListAcceptancesInput, ProjectAcceptanceRow, ProjectAcceptanceItemRow } from "./shared";

export async function createAcceptance(this: any, input: Partial<ProjectAcceptanceRow>) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .insert(input)
    .select("*")
    .single();

  if (error) throw Errors.dbError("创建项目验收单失败", error);
  return data as ProjectAcceptanceRow;
}

export async function createItems(this: any, items: Array<Partial<ProjectAcceptanceItemRow>>) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_items")
    .insert(items)
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw Errors.dbError("创建项目验收项失败", error);
  return (data || []) as ProjectAcceptanceItemRow[];
}

export async function listAcceptances(this: any, input: ListAcceptancesInput) {
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;

  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (input.tenantId) {
    query = query.eq("tenant_id", input.tenantId);
  }

  if (input.visibleProjectIds) {
    if (input.visibleProjectIds.length === 0) {
      return { list: [] as ProjectAcceptanceRow[], total: 0 };
    }
    query = query.in("project_id", input.visibleProjectIds);
  }

  if (input.project_id) query = query.eq("project_id", input.project_id);
  if (input.acceptance_type) query = query.eq("acceptance_type", input.acceptance_type);
  if (input.status) query = query.eq("status", input.status);
  if (input.stage_code) query = query.eq("stage_code", input.stage_code);
  if (input.reviewer_id) query = query.eq("reviewer_id", input.reviewer_id);
  if (input.customer_id) query = query.eq("customer_id", input.customer_id);

  const { data, error, count } = await query;
  if (error) throw Errors.dbError("查询项目验收列表失败", error);

  return {
    list: (data || []) as ProjectAcceptanceRow[],
    total: count || 0,
  };
}

export async function getAcceptanceById(this: any, id: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .select("*")
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw Errors.dbError("查询项目验收单失败", error);
  return (data || null) as ProjectAcceptanceRow | null;
}

export async function updateAcceptance(this: any, 
  id: string,
  input: Record<string, unknown>,
  tenantId?: string | null,
) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .update(input)
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.select("*").maybeSingle();

  if (error) throw Errors.dbError("更新项目验收单失败", error);
  if (!data) throw Errors.badRequest("项目验收单不存在");
  return data as ProjectAcceptanceRow;
}

export async function deleteAcceptance(this: any, id: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .delete()
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { error } = await query.select("id");

  if (error) throw Errors.dbError("删除项目验收草稿失败", error);
}
