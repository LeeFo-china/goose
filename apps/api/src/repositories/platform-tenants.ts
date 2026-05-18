import { Errors } from "@/errors/error-factory";
import type {
  CreatePlatformTenantInput,
  PlatformTenantListQuery,
  PlatformTenantStatus,
  UpdatePlatformTenantInput,
} from "@/schema/platform-tenants";
import { SupabaseDB } from "@/utils/supabase";
import {
  DepartmentConfig,
  DEPARTMENT_CODE_VALUES,
  EmployeePostConfig,
  EMPLOYEE_POST_CODE_VALUES,
} from "@gooes/domain";

export type PlatformTenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: PlatformTenantStatus;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformTenantUsageStats = {
  employee_count: number;
  customer_count: number;
  project_count: number;
  h5_page_count: number;
  camera_count: number;
};

export type PlatformTenantInitializationResult = {
  template_code: string;
  template_version: string;
  departments_count: number;
  posts_count: number;
  roles_count: number;
  admin_employee_id: string | null;
  admin_role_id: string | null;
};

export type PlatformTenantTemplateApplication = {
  id: string;
  tenant_id: string;
  template_id: string | null;
  template_code: string;
  template_version: string;
  applied_by_employee_id: string | null;
  applied_at: string;
  result: Record<string, unknown>;
  created_at: string;
};

export type PlatformTenantEmployeeLite = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  department_id: string | null;
  post_id: string | null;
  role: string | null;
  created_at: string | null;
};

type PlatformTenantEmployeeRow = Omit<PlatformTenantEmployeeLite, "role">;

export type PlatformTenantRoleLite = {
  id: string;
  tenant_id: string | null;
  code: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

const EMPTY_USAGE: PlatformTenantUsageStats = {
  employee_count: 0,
  customer_count: 0,
  project_count: 0,
  h5_page_count: 0,
  camera_count: 0,
};

type UsageTableKey = keyof PlatformTenantUsageStats;

const USAGE_TABLES: Array<{ table: string; key: UsageTableKey }> = [
  { table: "employees", key: "employee_count" },
  { table: "customers", key: "customer_count" },
  { table: "projects", key: "project_count" },
  { table: "marketing_pages", key: "h5_page_count" },
  { table: "project_cameras", key: "camera_count" },
];

class PlatformTenantRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async list(query: PlatformTenantListQuery) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let request = this.from("tenants")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.status) {
      request = request.eq("status", query.status);
    }

    if (query.keyword) {
      const keyword = query.keyword.replace(/[,()]/g, " ").trim();
      if (keyword) {
        request = request.or(
          `name.ilike.%${keyword}%,slug.ilike.%${keyword}%,contact_name.ilike.%${keyword}%,contact_phone.ilike.%${keyword}%`,
        );
      }
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询租户列表失败", error);
    }

    const records = (data || []) as PlatformTenantRecord[];
    const usageMap = await this.getUsageStats(records.map((item) => item.id));

    return {
      list: records.map((item) => ({
        ...item,
        usage: usageMap.get(item.id) ?? { ...EMPTY_USAGE },
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async findById(id: string) {
    const { data, error } = await this.from("tenants")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户失败", error);
    }

    return (data || null) as PlatformTenantRecord | null;
  }

  async findBySlug(slug: string) {
    const { data, error } = await this.from("tenants")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户标识失败", error);
    }

    return (data || null) as PlatformTenantRecord | null;
  }

  async create(input: CreatePlatformTenantInput) {
    const { data, error } = await this.from("tenants")
      .insert({
        name: input.name,
        slug: input.slug,
        status: input.status,
        contact_name: input.contact_name ?? null,
        contact_phone: input.contact_phone ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建租户失败", error);
    }

    return data as PlatformTenantRecord;
  }

  async findEmployeesByPhone(phone: string) {
    const { data, error } = await this.from("employees")
      .select("id,tenant_id,name,phone,status")
      .eq("phone", phone);

    if (error) {
      throw Errors.dbError("查询管理员手机号占用失败", error);
    }

    return (data || []) as Array<{
      id: string;
      tenant_id: string | null;
      name: string | null;
      phone: string | null;
      status: string | null;
    }>;
  }

  async initializeDefaultData(input: {
    tenantId: string;
    operatorEmployeeId?: string | null;
    admin?: NonNullable<CreatePlatformTenantInput["admin"]>;
  }): Promise<PlatformTenantInitializationResult> {
    const departments = await this.upsertDefaultDepartments(
      input.tenantId,
    );
    const posts = await this.upsertDefaultPosts(input.tenantId);
    const roles = await this.upsertDefaultRoles(input.tenantId);
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
        departmentId: department?.id ?? null,
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

  async update(id: string, input: UpdatePlatformTenantInput) {
    const { data, error } = await this.from("tenants")
      .update({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.contact_name !== undefined ? { contact_name: input.contact_name ?? null } : {}),
        ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone ?? null } : {}),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新租户失败", error);
    }

    return (data || null) as PlatformTenantRecord | null;
  }

  async updateStatus(id: string, status: Exclude<PlatformTenantStatus, "archived">) {
    const { data, error } = await this.from("tenants")
      .update({ status })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新租户状态失败", error);
    }

    return (data || null) as PlatformTenantRecord | null;
  }

  async getUsageStats(tenantIds: string[]) {
    const uniqueTenantIds = Array.from(new Set(tenantIds.filter(Boolean)));
    const result = new Map<string, PlatformTenantUsageStats>();

    for (const tenantId of uniqueTenantIds) {
      result.set(tenantId, { ...EMPTY_USAGE });
    }

    if (uniqueTenantIds.length === 0) {
      return result;
    }

    await Promise.all(
      uniqueTenantIds.flatMap((tenantId) =>
        USAGE_TABLES.map(async ({ table, key }) => {
          const { count, error } = await this.from(table)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId);

          if (error) {
            throw Errors.dbError("查询租户用量统计失败", { table, error });
          }

          const usage = result.get(tenantId);
          if (usage) {
            usage[key] = count || 0;
          }
        })
      ),
    );

    return result;
  }

  async getLatestTemplateApplication(tenantId: string) {
    const { data, error } = await this.from("tenant_template_applications")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户模板初始化记录失败", error);
    }

    return (data || null) as PlatformTenantTemplateApplication | null;
  }

  async findEmployeesByIds(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return new Map<string, PlatformTenantEmployeeLite>();
    }

    const { data, error } = await this.from("employees")
      .select("id,tenant_id,name,phone,status,department_id,post_id,created_at")
      .in("id", uniqueIds);

    if (error) {
      throw Errors.dbError("查询租户员工信息失败", error);
    }

    return new Map(
      ((data || []) as PlatformTenantEmployeeRow[]).map((item) => [item.id, { ...item, role: null }]),
    );
  }

  async findTenantAdminEmployees(tenantId: string) {
    const { data: roles, error: roleError } = await this.from("roles")
      .select("id,code")
      .eq("tenant_id", tenantId)
      .eq("code", "system_admin")
      .eq("status", "active");

    if (roleError) {
      throw Errors.dbError("查询租户管理员角色失败", roleError);
    }

    const roleIds = ((roles || []) as Array<{ id: string; code: string | null }>).map((item) => item.id);
    if (roleIds.length === 0) {
      return [];
    }

    const { data: employeeRoles, error: employeeRoleError } = await this.from("employee_roles")
      .select("employee_id")
      .in("role_id", roleIds);

    if (employeeRoleError) {
      throw Errors.dbError("查询租户管理员绑定失败", employeeRoleError);
    }

    const employeeIds = Array.from(
      new Set(
        ((employeeRoles || []) as Array<{ employee_id: string | null }>)
          .map((item) => item.employee_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (employeeIds.length === 0) {
      return [];
    }

    const { data, error } = await this.from("employees")
      .select("id,tenant_id,name,phone,status,department_id,post_id,created_at")
      .eq("tenant_id", tenantId)
      .in("id", employeeIds)
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询租户管理员失败", error);
    }

    return ((data || []) as PlatformTenantEmployeeRow[]).map((item) => ({
      ...item,
      role: "system_admin",
    }));
  }

  async findRolesByIds(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return new Map<string, PlatformTenantRoleLite>();
    }

    const { data, error } = await this.from("roles")
      .select("id,tenant_id,code,name,description,status,created_at")
      .in("id", uniqueIds);

    if (error) {
      throw Errors.dbError("查询租户角色信息失败", error);
    }

    return new Map(
      ((data || []) as PlatformTenantRoleLite[]).map((item) => [item.id, item]),
    );
  }

  async listTenantRoles(tenantId: string) {
    const { data, error } = await this.from("roles")
      .select("id,tenant_id,code,name,description,status,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询租户角色列表失败", error);
    }

    return (data || []) as PlatformTenantRoleLite[];
  }

  private async upsertDefaultDepartments(
    tenantId: string,
    enabledCodes: string[] = [],
  ) {
    const rows = DEPARTMENT_CODE_VALUES.map((code) => ({
      tenant_id: tenantId,
      code,
      name: DepartmentConfig[code].label,
    }));

    const { data, error } = await this.from("departments")
      .upsert(rows, { onConflict: "tenant_id,code" })
      .select("*");

    if (error) {
      throw Errors.dbError("初始化租户部门失败", error);
    }

    const departments = (data || []) as Array<{ id: string; code: string; name: string }>;
    await this.upsertTenantDepartmentConfigs({
      tenantId,
      departments,
      enabledCodes,
    });

    return departments;
  }

  private async upsertTenantDepartmentConfigs(input: {
    tenantId: string;
    departments: Array<{ id: string; code: string; name: string }>;
    enabledCodes?: string[];
  }) {
    if (input.departments.length === 0) {
      return;
    }

    const codes = input.departments.map((department) => department.code);
    const { data: templates, error: templateError } = await this.from("department_templates")
      .select("id, code, sort")
      .in("code", codes);

    if (templateError) {
      throw Errors.dbError("查询部门模板失败", templateError);
    }

    const templateMap = new Map(
      ((templates || []) as Array<{ id: string; code: string; sort: number | null }>)
        .map((template) => [template.code, template]),
    );
    const { data: existingTenantDepartments, error: existingTenantDepartmentsError } =
      await this.from("tenant_departments")
        .select("code, enabled")
        .eq("tenant_id", input.tenantId)
        .in("code", codes);

    if (existingTenantDepartmentsError) {
      throw Errors.dbError("查询租户部门配置失败", existingTenantDepartmentsError);
    }

    const existingEnabledMap = new Map(
      ((existingTenantDepartments || []) as Array<{ code: string; enabled: boolean }>)
        .map((department) => [department.code, department.enabled]),
    );
    const enabledCodeSet = new Set(input.enabledCodes ?? []);
    const rows = input.departments
      .map((department) => {
        const template = templateMap.get(department.code);
        if (!template) {
          return null;
        }

        return {
          tenant_id: input.tenantId,
          template_id: template.id,
          code: department.code,
          alias_name: department.name,
          enabled: existingEnabledMap.get(department.code) ?? enabledCodeSet.has(department.code),
          sort: template.sort ?? 0,
          legacy_department_id: department.id,
        };
      })
      .filter(Boolean);

    if (rows.length === 0) {
      return;
    }

    const { error } = await this.from("tenant_departments")
      .upsert(rows, { onConflict: "tenant_id,code" });

    if (error) {
      throw Errors.dbError("初始化租户部门配置失败", error);
    }
  }

  private async upsertDefaultPosts(tenantId: string) {
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

  private async upsertDefaultRoles(tenantId: string) {
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

  private async grantAllPermissionsToRole(roleId: string) {
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
      .upsert(rows, { onConflict: "role_id,permission_id" });

    if (error) {
      throw Errors.dbError("初始化租户管理员权限失败", error);
    }
  }

  private async createTenantAdminEmployee(input: {
    tenantId: string;
    name: string;
    phone: string;
    authUserId: string | null;
    departmentId: string | null;
    postId: string | null;
  }) {
    const { data, error } = await this.from("employees")
      .insert({
        tenant_id: input.tenantId,
        name: input.name,
        phone: input.phone,
        user_id: input.authUserId,
        department_id: input.departmentId,
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

  private async assignEmployeeRole(employeeId: string, roleId: string) {
    const { error } = await this.from("employee_roles")
      .upsert({
        employee_id: employeeId,
        role_id: roleId,
      }, { onConflict: "employee_id,role_id" });

    if (error) {
      throw Errors.dbError("绑定租户管理员角色失败", error);
    }
  }

  private async recordTemplateApplication(input: {
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
      }, { onConflict: "tenant_id,template_code,template_version" });

    if (error) {
      throw Errors.dbError("记录租户模板初始化结果失败", error);
    }
  }
}

export const platformTenantRepository = new PlatformTenantRepository();
