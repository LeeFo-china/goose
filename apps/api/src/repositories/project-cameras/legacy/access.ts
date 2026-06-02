import { Errors } from "./shared";
import type { CustomerOwnedProjectTenantRow } from "./shared";

export async function getCustomerOwnedProjectTenant(this: any, input: {
  authUserId: string;
  projectId: string;
}) {
  const { data: customers, error: customerError } = await this.adminClient
    .from("customers")
    .select("id, tenant_id")
    .eq("user_id", input.authUserId);

  if (customerError) {
    throw Errors.dbError("查询客户项目权限失败", customerError);
  }

  const customerRows = (customers || []) as Array<{
    id?: string | null;
    tenant_id?: string | null;
  }>;
  const customerIds = customerRows
    .map((customer) => customer.id)
    .filter((id): id is string => Boolean(id));
  if (!customerIds.length) {
    return null;
  }

  const { data: project, error: projectError } = await this.adminClient
    .from("projects")
    .select("id, tenant_id, customer_id, status")
    .eq("id", input.projectId)
    .in("customer_id", customerIds)
    .maybeSingle();

  if (projectError) {
    throw Errors.dbError("查询客户项目权限失败", projectError);
  }

  const projectRow = project as {
    tenant_id?: string | null;
    customer_id?: string | null;
    status?: string | null;
  } | null;
  const customer = customerRows.find((item) =>
    item.id === projectRow?.customer_id && item.tenant_id === projectRow?.tenant_id
  );
  if (!projectRow || !customer) {
    return null;
  }

  const status = projectRow.status;
  if (status === "acceptance" || status === "invalid") {
    return null;
  }

  return {
    tenant_id: projectRow.tenant_id || null,
  } satisfies CustomerOwnedProjectTenantRow;
}

export async function getProject(this: any, projectId: string, tenantId?: string | null) {
  let query = this.adminClient
    .from("projects")
    .select("id, tenant_id")
    .eq("id", projectId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw Errors.dbError("查询项目失败", error);
  }

  return (data || null) as { id: string; tenant_id: string | null } | null;
}
