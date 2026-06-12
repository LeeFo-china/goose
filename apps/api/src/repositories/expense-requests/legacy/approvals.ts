import { Errors, SupabaseDB } from "./shared";
import type {
  ExpenseApprovalCandidateEmployee,
  ExpenseRequestApprovalPayload,
} from "./shared";

export async function appendApproval(this: any, payload: ExpenseRequestApprovalPayload) {
  const { error } = await SupabaseDB.getAdminClient()
    .from("expense_request_approvals")
    .upsert({
      tenant_id: payload.tenant_id ?? null,
      expense_request_id: payload.expense_request_id,
      approval_round: payload.approval_round ?? 1,
      step: payload.step,
      action: payload.action,
      approver_id: payload.approver_id ?? null,
      comment: payload.comment ?? null,
    }, {
      onConflict:
        "tenant_id,expense_request_id,approval_round,step,action,approver_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    throw Errors.dbError("写入费用审批记录失败", error);
  }
}

export async function findApprovalByBusinessKey(this: any, 
  payload: Required<Pick<
    ExpenseRequestApprovalPayload,
    "expense_request_id" | "approval_round" | "step" | "action"
  >> & {
    tenant_id?: string | null;
    approver_id?: string | null;
  },
) {
  let query = SupabaseDB.getAdminClient()
    .from("expense_request_approvals")
    .select("id")
    .eq("expense_request_id", payload.expense_request_id)
    .eq("approval_round", payload.approval_round)
    .eq("step", payload.step)
    .eq("action", payload.action);

  if (payload.tenant_id) {
    query = query.eq("tenant_id", payload.tenant_id);
  }

  if (payload.approver_id) {
    query = query.eq("approver_id", payload.approver_id);
  } else {
    query = query.is("approver_id", null);
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    throw Errors.dbError("查询费用审批记录失败", error);
  }

  return Boolean(data?.id);
}

export async function findEmployeeForApproval(this: any, id: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("employees")
    .select(`
      id,
      name,
      phone,
      avatar,
      status,
      tenant_department_id,
      post_id,
      tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
      post:posts!employees_post_id_fkey(name)
    `)
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw Errors.dbError("查询审批人失败", error);
  }

  return (data as unknown) as ExpenseApprovalCandidateEmployee | null;
}

export async function listEmployeesForApprovalCandidates(this: any, input: {
  keyword?: string;
  tenantId?: string | null;
}) {
  let query = SupabaseDB.getAdminClient()
    .from("employees")
    .select(`
      id,
      name,
      phone,
      avatar,
      status,
      tenant_department_id,
      post_id,
      tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
      post:posts!employees_post_id_fkey(name)
    `)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (input.tenantId) {
    query = query.eq("tenant_id", input.tenantId);
  }

  const keyword = input.keyword?.trim();
  if (keyword) {
    query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw Errors.dbError("查询审批候选人失败", error);
  }

  return ((data || []) as unknown) as ExpenseApprovalCandidateEmployee[];
}

export async function listEmployeePermissionContexts(this: any, employeeIds: string[], permissionCode: string) {
  if (employeeIds.length === 0) {
    return [] as Array<{
      employee_id: string;
      role_scope: string | null;
      override_effect: string | null;
      override_scope: string | null;
    }>;
  }

  const [roleResult, overrideResult] = await Promise.all([
    SupabaseDB.getAdminClient()
      .from("employee_roles")
      .select(`
        employee_id,
        role:roles!employee_roles_role_id_fkey(
          status,
          role_permissions(
            access_scope,
            permission:permissions!role_permissions_permission_id_fkey(code, status)
          )
        )
      `)
      .in("employee_id", employeeIds),
    SupabaseDB.getAdminClient()
      .from("employee_permission_overrides")
      .select(`
        employee_id,
        effect,
        access_scope,
        permission:permissions!employee_permission_overrides_permission_id_fkey(code, status)
      `)
      .in("employee_id", employeeIds),
  ]);

  if (roleResult.error) {
    throw Errors.dbError("查询审批候选人权限失败", roleResult.error);
  }

  if (overrideResult.error) {
    throw Errors.dbError("查询审批候选人权限失败", overrideResult.error);
  }

  const rows: Array<{
    employee_id: string;
    role_scope: string | null;
    override_effect: string | null;
    override_scope: string | null;
  }> = [];

  for (const item of (roleResult.data || []) as Array<any>) {
    const role = Array.isArray(item.role) ? item.role[0] : item.role;
    if (!role || role.status !== "active") {
      continue;
    }

    const rolePermissions = Array.isArray(role.role_permissions)
      ? role.role_permissions
      : [];
    for (const rolePermission of rolePermissions) {
      const permission = Array.isArray(rolePermission.permission)
        ? rolePermission.permission[0]
        : rolePermission.permission;
      if (
        permission?.code === permissionCode &&
        permission?.status === "active"
      ) {
        rows.push({
          employee_id: item.employee_id,
          role_scope: rolePermission.access_scope ?? "self",
          override_effect: null,
          override_scope: null,
        });
      }
    }
  }

  for (const item of (overrideResult.data || []) as Array<any>) {
    const permission = Array.isArray(item.permission)
      ? item.permission[0]
      : item.permission;
    if (
      permission?.code === permissionCode &&
      permission?.status === "active"
    ) {
      rows.push({
        employee_id: item.employee_id,
        role_scope: null,
        override_effect: item.effect,
        override_scope: item.access_scope ?? null,
      });
    }
  }

  return rows;
}
