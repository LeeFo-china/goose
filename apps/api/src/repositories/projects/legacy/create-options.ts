import { Errors, escapeSupabaseOrValue, SupabaseDB } from "./shared";
import type {
  CreateProjectInput,
  ProjectCreateCustomerFilters,
  ProjectCreateEmployeeFilters,
} from "./shared";

export async function create(this: any, input: CreateProjectInput & { tenant_id: string }) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .insert(input)
    .select()
    .single();

  if (error) {
    throw Errors.dbError("创建失败", error);
  }

  return data as Record<string, unknown>;
}

export async function findActiveByCustomerProperty(this: any, input: {
  customerId: string;
  propertyId: string;
  tenantId: string;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("customer_id", input.customerId)
    .eq("property_id", input.propertyId)
    .neq("status", "invalid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询客户设计项目失败", error);
  }

  return (data as Record<string, unknown> | null) ?? null;
}

export async function findCustomerInTenant(this: any, input: { customerId: string; tenantId: string }) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select("id")
    .eq("id", input.customerId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("校验项目客户失败", error);
  }

  return data;
}

export async function findPropertyInTenant(this: any, input: { propertyId: string; tenantId: string }) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("properties")
    .select("id")
    .eq("id", input.propertyId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("校验项目房产失败", error);
  }

  return data;
}

export async function listCreateCustomers(this: any, input: {
  filters: ProjectCreateCustomerFilters;
  from: number;
  to: number;
}) {
  let query = SupabaseDB.getAdminClient()
    .from("customers")
    .select("id, name, phone, owner_id", { count: "exact" })
    .eq("tenant_id", input.filters.tenantId)
    .order("created_at", { ascending: false });

  const normalizedKeyword = input.filters.keyword?.trim();
  if (normalizedKeyword) {
    const escapedKeyword = escapeSupabaseOrValue(normalizedKeyword);
    query = query.or(
      `name.ilike.%${escapedKeyword}%,phone.ilike.%${escapedKeyword}%`,
    );
  }

  const { data, error, count } = await query.range(input.from, input.to);

  if (error) {
    throw Errors.dbError("查询项目创建客户选择项失败", error);
  }

  return {
    rows: (data || []) as unknown as Array<Record<string, unknown>>,
    total: count ?? 0,
  };
}

export async function listCreateEmployees(this: any, input: {
  filters: ProjectCreateEmployeeFilters;
  from: number;
  to: number;
}) {
  let departmentIds: string[] | undefined;
  if (input.filters.departmentCodes && input.filters.departmentCodes.length > 0) {
    const { data: departmentRows, error: departmentError } = await SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select("id")
      .eq("tenant_id", input.filters.tenantId)
      .eq("enabled", true)
      .in("code", input.filters.departmentCodes);

    if (departmentError) {
      throw Errors.dbError("查询项目创建员工部门失败", departmentError);
    }

    departmentIds = ((departmentRows || []) as Array<{ id: string | null }>)
      .map((item) => item.id)
      .filter((item): item is string => Boolean(item));

    if (departmentIds.length === 0) {
      return {
        rows: [],
        total: 0,
      };
    }
  }

  let query = SupabaseDB.getAdminClient()
    .from("employees")
    .select(
      `
      id,
      name,
      avatar,
      phone,
      tenant_department_id,
      tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
      post:posts!employees_post_id_fkey(id, name, code)
    `,
      { count: "exact" },
    )
    .eq("status", "active")
    .eq("tenant_id", input.filters.tenantId)
    .order("created_at", { ascending: false });

  if (departmentIds && departmentIds.length > 0) {
    query = query.in("tenant_department_id", departmentIds);
  }

  if (input.filters.postIds && input.filters.postIds.length > 0) {
    query = query.in("post_id", input.filters.postIds);
  }

  const normalizedKeyword = input.filters.keyword?.trim();
  if (normalizedKeyword) {
    const escapedKeyword = escapeSupabaseOrValue(normalizedKeyword);
    query = query.or(
      `name.ilike.%${escapedKeyword}%,phone.ilike.%${escapedKeyword}%`,
    );
  }

  const { data, error, count } = await query.range(input.from, input.to);

  if (error) {
    throw Errors.dbError("查询项目创建员工选择项失败", error);
  }

  return {
    rows: (data || []) as unknown as Array<Record<string, unknown>>,
    total: count ?? 0,
  };
}
