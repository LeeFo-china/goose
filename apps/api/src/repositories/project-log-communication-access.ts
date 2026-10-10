import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
class ProjectLogCommunicationAccessRepository {
  async canReadProjectScope(input: {
    projectId: string;
    tenantId: string;
    employeeId: string;
    scope: "all" | "self" | "assigned" | "department";
    departmentId: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient().rpc("can_access_project_communication_scope", {
      p_project_id: input.projectId, p_tenant_id: input.tenantId, p_employee_id: input.employeeId,
      p_scope: input.scope, p_department_id: input.departmentId,
    });
    if (error)
      throw Errors.dbError("查询项目沟通权限范围失败", error);
    return data === true;
  }
  async findCustomer(input: {
    customerId: string;
    tenantId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient().from("customers")
      .select("id, name").eq("id", input.customerId).eq("tenant_id", input.tenantId)
      .maybeSingle<{
      id: string;
      name: string | null;
    }>();
    if (error)
      throw Errors.dbError("查询项目沟通客户失败", error);
    return data;
  }
  async hasMembership(input: {
    userId: string;
    tenantId: string;
    customerId: string;
  }) {
    // Direct, narrowly scoped lookup: identity-switch caches must not delay revocation.
    const { data, error } = await SupabaseDB.getAdminClient().from("user_business_memberships")
      .select("id").eq("user_id", input.userId).eq("tenant_id", input.tenantId)
      .eq("identity_type", "customer").eq("identity_id", input.customerId)
      .eq("status", "active").limit(1);
    if (error)
      throw Errors.dbError("查询项目沟通客户绑定失败", error);
    return Boolean(data?.length);
  }
}
export const projectLogCommunicationAccessRepository = new ProjectLogCommunicationAccessRepository();
