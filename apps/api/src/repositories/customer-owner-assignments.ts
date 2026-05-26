import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type AssignableCustomerOwner = {
  id: string;
  name: string | null;
  tenant_department_id?: string | null;
  status: string | null;
  tenant_id?: string | null;
};

export type AssignableCustomer = {
  id: string;
  owner_id: string | null;
  tenant_id?: string | null;
};

class CustomerOwnerAssignmentRepository {
  async findTargetEmployee(input: { ownerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, name, tenant_department_id, status, tenant_id")
      .eq("id", input.ownerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询目标负责人失败", error);
    }

    return (data as AssignableCustomerOwner | null) ?? null;
  }

  async listCustomers(input: { customerIds: string[]; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, tenant_id")
      .in("id", input.customerIds)
      .eq("tenant_id", input.tenantId);

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    return (data || []) as AssignableCustomer[];
  }

  async updateOwner(input: {
    customerIds: string[];
    ownerId: string;
    tenantId: string;
  }) {
    if (input.customerIds.length === 0) {
      return;
    }

    const { error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update({ owner_id: input.ownerId })
      .in("id", input.customerIds)
      .eq("tenant_id", input.tenantId)
      .select("id");

    if (error) {
      throw Errors.dbError("批量分配负责人失败", error);
    }
  }
}

export const customerOwnerAssignmentRepository =
  new CustomerOwnerAssignmentRepository();
