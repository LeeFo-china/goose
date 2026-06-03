import { Errors, SupabaseDB } from "./shared";
import type { ProjectAcceptanceCustomerRow, ProjectAcceptanceEmployeeRow } from "./shared";

export async function listEmployees(this: any, ids: string[]) {
  if (ids.length === 0) return [] as ProjectAcceptanceEmployeeRow[];
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("employees")
    .select("id, tenant_id, name, avatar")
    .in("id", ids);

  if (error) throw Errors.dbError("查询员工失败", error);
  return (data || []) as ProjectAcceptanceEmployeeRow[];
}

export async function listEmployeesByTenant(this: any, tenantId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("employees")
    .select("id, tenant_id, name, avatar")
    .eq("tenant_id", tenantId)
    .limit(200);

  if (error) throw Errors.dbError("查询租户员工失败", error);
  return (data || []) as ProjectAcceptanceEmployeeRow[];
}

export async function listCustomers(this: any, ids: string[]) {
  if (ids.length === 0) return [] as ProjectAcceptanceCustomerRow[];
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select(`
      id,
      tenant_id,
      name,
      phone,
      user_id,
      tenant:tenants!customers_tenant_id_fkey(
        id,
        status
      )
    `)
    .in("id", ids);

  if (error) throw Errors.dbError("查询客户失败", error);
  return (data || []) as ProjectAcceptanceCustomerRow[];
}

export async function getTenantById(this: any, id: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("tenants")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();

  if (error) throw Errors.dbError("查询租户状态失败", error);
  return (data || null) as { id: string; status: string | null } | null;
}
