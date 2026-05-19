import { Errors } from "@/errors/error-factory";
import type { FollowUpInsert } from "@/schema/customer";
import { SupabaseDB } from "@/utils/supabase";

export const CUSTOMER_FOLLOW_UP_SELECT = `
  *,
  employee:employees!customer_follow_ups_employee_id_fkey(
    id,
    name,
    phone,
    avatar
  )
`;

export type CustomerFollowUpAccessCustomer = {
  id: string;
  owner_id: string | null;
  tenant_id: string | null;
};

export type CustomerFollowUpEmployee = {
  id: string;
  status: string | null;
  tenant_id: string | null;
};

export type CustomerFollowUpRow = {
  id: string;
  customer_id: string | null;
  content: string;
  next_follow_at: string | null;
  created_at: string;
  employee?: unknown;
  employee_id: string | null;
};

type CustomerDateField = "created_at" | "updated_at";
type FollowUpDateField = "created_at" | "next_follow_at";

class CustomerFollowUpRepository {
  async findCustomerAccess(input: { customerId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, owner_id, tenant_id")
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    return (data as CustomerFollowUpAccessCustomer | null) ?? null;
  }

  async findEmployee(input: { employeeId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, status, tenant_id")
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询跟进员工失败", error);
    }

    return (data as CustomerFollowUpEmployee | null) ?? null;
  }

  async listByCustomer(input: {
    customerId: string;
    from: number;
    to: number;
  }) {
    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("customer_follow_ups")
      .select(CUSTOMER_FOLLOW_UP_SELECT, { count: "exact" })
      .eq("customer_id", input.customerId)
      .order("created_at", { ascending: false })
      .range(input.from, input.to);

    if (error) {
      throw Errors.dbError("查询客户跟进记录失败", error);
    }

    return {
      list: (data || []) as unknown as CustomerFollowUpRow[],
      count: count || 0,
    };
  }

  async listLatestByCustomerIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as CustomerFollowUpRow[];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_ups")
      .select(CUSTOMER_FOLLOW_UP_SELECT)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户跟进摘要失败", error);
    }

    return (data || []) as unknown as CustomerFollowUpRow[];
  }

  async listTenantCustomerIds(input: {
    customerIds: string[];
    tenantId: string;
  }) {
    if (input.customerIds.length === 0) {
      return [] as string[];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id")
      .in("id", input.customerIds)
      .eq("tenant_id", input.tenantId);

    if (error) {
      throw Errors.dbError("校验客户租户边界失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
  }

  async listCustomerIdsByDateField(input: {
    tenantId: string;
    field: CustomerDateField;
    startIso: string;
    endIso: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .gte(input.field, input.startIso)
      .lt(input.field, input.endIso);

    if (error) {
      throw Errors.dbError("查询今日客户失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
  }

  async listFollowUpCustomerIdsByDateField(input: {
    field: FollowUpDateField;
    startIso: string;
    endIso: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_ups")
      .select("customer_id")
      .gte(input.field, input.startIso)
      .lt(input.field, input.endIso);

    if (error) {
      throw Errors.dbError("查询今日客户跟进失败", error);
    }

    return ((data || []) as Array<{ customer_id: string | null }>)
      .map((item) => item.customer_id)
      .filter((item): item is string => Boolean(item));
  }

  async create(input: FollowUpInsert & { customer_id: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_ups")
      .insert(input)
      .select(CUSTOMER_FOLLOW_UP_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建客户跟进记录失败", error);
    }

    return data as unknown as CustomerFollowUpRow;
  }
}

export const customerFollowUpRepository = new CustomerFollowUpRepository();
