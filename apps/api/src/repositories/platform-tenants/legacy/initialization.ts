import { DepartmentConfig, DEPARTMENT_CODE_VALUES, EMPLOYEE_POST_CODE_VALUES, EmployeePostConfig, Errors } from "./shared";
import type { CreatePlatformTenantInput, PlatformTenantDepartmentLite, PlatformTenantInitializationResult } from "./shared";

type PlatformTenantPostLite = {
  id: string;
  code: string;
  name: string;
};

type PlatformTenantRoleInitRow = {
  id: string;
  code: string;
  name: string;
};

export async function initializeDefaultData(this: any, input: {
  tenantId: string;
  operatorEmployeeId?: string | null;
  admin?: NonNullable<CreatePlatformTenantInput["admin"]>;
}): Promise<PlatformTenantInitializationResult> {
  const departments: PlatformTenantDepartmentLite[] = await this.upsertDefaultDepartments(
    input.tenantId,
  );
  const posts: PlatformTenantPostLite[] = await this.upsertDefaultPosts(input.tenantId);
  const roles: PlatformTenantRoleInitRow[] = await this.upsertDefaultRoles(input.tenantId);
  const systemAdminRole = roles.find((item) => item.code === "system_admin") ?? null;

  if (systemAdminRole) {
    await this.grantAllPermissionsToRole(systemAdminRole.id);
  }

  let adminEmployeeId: string | null = null;
  if (input.admin) {
    const department = departments.find((item) => item.code === input.admin?.department_code)
      ?? departments.find((item) => item.code === "ADMIN")
      ?? null;
    const post = posts.find((item) => item.code === input.admin?.post_code)
      ?? posts.find((item) => item.code === "SYSTEM_ADMIN")
      ?? null;
    const adminEmployee = await this.createTenantAdminEmployee({
      tenantId: input.tenantId,
      name: input.admin.name,
      phone: input.admin.phone,
      authUserId: input.admin.auth_user_id ?? null,
      departmentCode: department?.code ?? null,
      postId: post?.id ?? null,
    });
    adminEmployeeId = adminEmployee.id;

    if (systemAdminRole) {
      await this.assignEmployeeRole(adminEmployee.id, systemAdminRole.id);
    }
  }

  await this.recordTemplateApplication({
    tenantId: input.tenantId,
    operatorEmployeeId: input.operatorEmployeeId ?? null,
    result: {
      departments_count: departments.length,
      posts_count: posts.length,
      roles_count: roles.length,
      admin_employee_id: adminEmployeeId,
      admin_role_id: systemAdminRole?.id ?? null,
    },
  });

  return {
    template_code: "default_decoration_company",
    template_version: "2026.05.10",
    departments_count: departments.length,
    posts_count: posts.length,
    roles_count: roles.length,
    admin_employee_id: adminEmployeeId,
    admin_role_id: systemAdminRole?.id ?? null,
  };
}

export async function upsertDefaultDepartments(this: any, 
  tenantId: string,
  enabledCodes: string[] = [],
): Promise<PlatformTenantDepartmentLite[]> {
  const codes = [...DEPARTMENT_CODE_VALUES];
  const { data: templates, error: templateError } = await this.from("department_templates")
    .select("id, code, default_name, sort")
    .in("code", codes);

  if (templateError) {
    throw Errors.dbError("查询部门模板失败", templateError);
  }

  const templateMap = new Map(
    ((templates || []) as Array<{
      id: string;
      code: string;
      default_name: string;
      sort: number | null;
    }>)
      .map((template) => [template.code, template]),
  );
  const { data: existingTenantDepartments, error: existingTenantDepartmentsError } =
    await this.from("tenant_departments")
      .select("code, enabled")
      .eq("tenant_id", tenantId)
      .in("code", codes);

  if (existingTenantDepartmentsError) {
    throw Errors.dbError("查询租户部门配置失败", existingTenantDepartmentsError);
  }

  const existingEnabledMap = new Map(
    ((existingTenantDepartments || []) as Array<{ code: string; enabled: boolean }>)
      .map((department) => [department.code, department.enabled]),
  );
  const enabledCodeSet = new Set(enabledCodes);
  const rows = codes
    .map((code) => {
      const template = templateMap.get(code);
      if (!template) {
        return null;
      }

      return {
        tenant_id: tenantId,
        template_id: template.id,
        code,
        alias_name: DepartmentConfig[code].label || template.default_name,
        enabled: existingEnabledMap.get(code) ?? enabledCodeSet.has(code),
        sort: template.sort ?? 0,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return [];
  }

  const { data, error } = await this.from("tenant_departments")
    .upsert(rows, { onConflict: "tenant_id,code" })
    .select("id, code, alias_name");

  if (error) {
    throw Errors.dbError("初始化租户部门配置失败", error);
  }

  return ((data || []) as Array<{ id: string; code: string; alias_name: string }>)
    .map((department) => ({
      id: department.id,
      code: department.code,
      name: department.alias_name,
    }));
}

export async function upsertDefaultPosts(this: any, tenantId: string) {
  const rows = EMPLOYEE_POST_CODE_VALUES.map((code, index) => ({
    tenant_id: tenantId,
    code,
    name: EmployeePostConfig[code].label,
    salary_type: "fixed",
    status: 1,
    sort: index + 1,
  }));

  const { data, error } = await this.from("posts")
    .upsert(rows, { onConflict: "tenant_id,code" })
    .select("*");

  if (error) {
    throw Errors.dbError("初始化租户岗位失败", error);
  }

  return (data || []) as Array<{ id: string; code: string; name: string }>;
}

export async function upsertDefaultRoles(this: any, tenantId: string) {
  const rows = [
    {
      tenant_id: tenantId,
      code: "system_admin",
      name: "系统管理员",
      description: "租户管理员，拥有当前租户全部后台管理权限",
      status: "active",
    },
    {
      tenant_id: tenantId,
      code: "employee_base",
      name: "员工基础角色",
      description: "普通员工的默认基础权限模板",
      status: "active",
    },
    {
      tenant_id: tenantId,
      code: "finance_base",
      name: "财务基础角色",
      description: "财务人员的默认基础权限模板",
      status: "active",
    },
    {
      tenant_id: tenantId,
      code: "design_manage",
      name: "设计主管",
      description: "设计主管的部门级客户查看与负责人分配权限模板",
      status: "active",
    },
  ];

  const { data, error } = await this.from("roles")
    .upsert(rows, { onConflict: "tenant_id,code" })
    .select("*");

  if (error) {
    throw Errors.dbError("初始化租户角色失败", error);
  }

  return (data || []) as Array<{ id: string; code: string; name: string }>;
}

export async function grantAllPermissionsToRole(this: any, roleId: string) {
  const { data: permissions, error: permissionError } = await this.from("permissions")
    .select("id")
    .eq("status", "active");

  if (permissionError) {
    throw Errors.dbError("查询默认角色权限失败", permissionError);
  }

  const rows = ((permissions || []) as Array<{ id: string }>).map((item) => ({
    role_id: roleId,
    permission_id: item.id,
    access_scope: "all",
  }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await this.from("role_permissions")
    .upsert(rows, { onConflict: "role_id,permission_id" })
    .select("id");

  if (error) {
    throw Errors.dbError("初始化租户管理员权限失败", error);
  }
}

export async function createTenantAdminEmployee(this: any, input: {
  tenantId: string;
  name: string;
  phone: string;
  authUserId: string | null;
  departmentCode: string | null;
  postId: string | null;
}) {
  const tenantDepartmentId = input.departmentCode
    ? await this.findTenantDepartmentIdByCode({
      tenantId: input.tenantId,
      code: input.departmentCode,
    })
    : null;
  const { data, error } = await this.from("employees")
    .insert({
      tenant_id: input.tenantId,
      name: input.name,
      phone: input.phone,
      user_id: input.authUserId,
      tenant_department_id: tenantDepartmentId,
      post_id: input.postId,
      status: "active",
      avatar: null,
    })
    .select("*")
    .single();

  if (error) {
    throw Errors.dbError("创建租户管理员失败", error);
  }

  return data as { id: string };
}

export async function findTenantDepartmentIdByCode(this: any, input: {
  tenantId: string;
  code: string;
}) {
  const { data, error } = await this.from("tenant_departments")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("code", input.code)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询租户部门配置失败", error);
  }

  return (data as { id: string } | null)?.id ?? null;
}

export async function assignEmployeeRole(this: any, employeeId: string, roleId: string) {
  const { error } = await this.from("employee_roles")
    .upsert({
      employee_id: employeeId,
      role_id: roleId,
    }, { onConflict: "employee_id,role_id" })
    .select("id");

  if (error) {
    throw Errors.dbError("绑定租户管理员角色失败", error);
  }
}

export async function recordTemplateApplication(this: any, input: {
  tenantId: string;
  operatorEmployeeId: string | null;
  result: Record<string, unknown>;
}) {
  const { data: template, error: templateError } = await this.from("tenant_templates")
    .select("id,code,version")
    .eq("code", "default_decoration_company")
    .eq("version", "2026.05.10")
    .maybeSingle();

  if (templateError) {
    throw Errors.dbError("查询租户模板失败", templateError);
  }

  const { error } = await this.from("tenant_template_applications")
    .upsert({
      tenant_id: input.tenantId,
      template_id: template?.id ?? null,
      template_code: "default_decoration_company",
      template_version: "2026.05.10",
      applied_by_employee_id: input.operatorEmployeeId,
      result: input.result,
    }, { onConflict: "tenant_id,template_code,template_version" })
    .select("id");

  if (error) {
    throw Errors.dbError("记录租户模板初始化结果失败", error);
  }
}
