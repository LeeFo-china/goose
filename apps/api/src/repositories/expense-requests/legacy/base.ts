import { Errors, SupabaseDB } from "./shared";
import type {
  ExpenseProjectCandidateRow,
  ExpenseRequestProjectCandidateQueryType,
  ExpenseRequestRecord,
} from "./shared";

export async function findById(this: any, 
  id: string,
  tenantId?: string | null,
): Promise<ExpenseRequestRecord | null> {
  let query = SupabaseDB.getAdminClient()
    .from("expense_requests")
    .select(this.detailSelect)
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw Errors.dbError("查询费用申请失败", error);
  }

  return (data as ExpenseRequestRecord | null) ?? null;
}

export async function employeeExists(this: any, id: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("employees")
    .select("id")
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw Errors.dbError("查询员工失败", error);
  }

  return Boolean(data?.id);
}

export async function projectExists(this: any, id: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("projects")
    .select("id")
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw Errors.dbError("查询项目失败", error);
  }

  return Boolean(data?.id);
}

export async function listProjectCandidates(this: any, input: {
  params: ExpenseRequestProjectCandidateQueryType;
  visibleProjectIds: string[] | null;
  tenantId?: string | null;
}) {
  if (input.visibleProjectIds && input.visibleProjectIds.length === 0) {
    return [] as ExpenseProjectCandidateRow[];
  }

  let query = SupabaseDB.getAdminClient()
    .from("projects")
    .select(`
      id,
      name,
      status,
      signed_amount,
      address,
      customer:customers!projects_customer_id_fkey(name),
      property:properties!projects_property_id_fkey(community, building_info)
    `)
    .neq("status", "invalid")
    .order("created_at", { ascending: false });

  if (input.tenantId) {
    query = query.eq("tenant_id", input.tenantId);
  }

  if (input.visibleProjectIds) {
    query = query.in("id", input.visibleProjectIds);
  }

  if (input.params.status) {
    query = query.eq("status", input.params.status);
  }

  const { data, error } = await query.limit(1000);
  if (error) {
    throw Errors.dbError("查询费用申请项目候选失败", error);
  }

  return ((data || []) as unknown) as ExpenseProjectCandidateRow[];
}
