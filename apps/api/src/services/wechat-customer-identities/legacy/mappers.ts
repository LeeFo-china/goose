import {
  wechatCustomerIdentityRepository,
  type UserBusinessMembershipRecord,
  type WechatCustomerTenantOption,
  type WechatLoginMembershipRow,
} from "./shared";

export function normalizeTenantRelation(value: WechatCustomerTenantOption["tenant"]) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function filterActiveTenantCustomers(customers: WechatCustomerTenantOption[]) {
  return customers.filter((item) => {
    const tenant = normalizeTenantRelation(item.tenant);
    return item.tenant_id && tenant?.status === "active";
  });
}

export function mapLoginMembership(
  row: WechatLoginMembershipRow,
): UserBusinessMembershipRecord {
  return {
    id: row.membership_id,
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    identity_type: row.identity_type as UserBusinessMembershipRecord["identity_type"],
    identity_id: row.identity_id,
    status: row.status as UserBusinessMembershipRecord["status"],
    is_default: row.is_default,
    created_at: "",
    updated_at: "",
  };
}

export function mapLoginCustomerOption(
  row: WechatLoginMembershipRow,
): WechatCustomerTenantOption | null {
  if (
    row.identity_type !== "customer" ||
    row.customer_id !== row.identity_id ||
    !row.customer_id ||
    !row.tenant_id ||
    row.tenant_status !== "active"
  ) {
    return null;
  }

  return {
    id: row.customer_id,
    name: row.customer_name,
    phone: row.customer_phone,
    user_id: row.customer_user_id,
    tenant_id: row.tenant_id,
    customer_origin: row.customer_origin,
    claimed_at: row.customer_claimed_at,
    tenant: {
      id: row.tenant_id,
      name: row.tenant_name,
      slug: row.tenant_slug,
      status: row.tenant_status,
    },
  };
}

export function collectEmployeeLoginRows(
  authUserId: string,
  rows: WechatLoginMembershipRow[],
) {
  return rows.filter((row) => (
    row.identity_type === "employee" &&
    row.employee_id === row.identity_id &&
    row.employee_user_id === authUserId &&
    row.employee_status === "active" &&
    row.tenant_id &&
    row.tenant_status === "active"
  ));
}

export async function enrichCustomerTenantOptions(
  customers: WechatCustomerTenantOption[],
) {
  if (customers.length === 0) {
    return [] as WechatCustomerTenantOption[];
  }

  const customerIds = customers.map((item) => item.id);
  const projects = await wechatCustomerIdentityRepository
    .listProjectSummariesByCustomerIds(customerIds);
  const projectMap = new Map<string, {
    count: number;
    latestName: string | null;
  }>();

  for (const project of projects) {
    if (!project.customer_id) continue;
    const current = projectMap.get(project.customer_id) ?? {
      count: 0,
      latestName: null,
    };
    current.count += 1;
    if (!current.latestName) {
      current.latestName = project.name ?? null;
    }
    projectMap.set(project.customer_id, current);
  }

  return customers.map((customer) => {
    const summary = projectMap.get(customer.id);
    return {
      ...customer,
      project_count: summary?.count ?? 0,
      latest_project_name: summary?.latestName ?? null,
    };
  });
}
