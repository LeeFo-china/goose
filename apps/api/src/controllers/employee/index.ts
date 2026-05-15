/**
 * 员工控制器 (Employee Controller)
 *
 * 提供员工数据的 CRUD 操作及自定义查询接口。
 * 继承 BaseController，使用 Zod 进行参数校验。
 *
 * @module controllers/employee
 */

import { BaseController } from "@/controllers/BaseController";
import {
  CreateEmployeeSchema,
  EmployeeListQuerySchema,
  UpdateEmployeeSchema,
} from "@/schema/employee";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import { Delete, Get } from "@/utils/decorators/route";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ResponseHandler } from "@/utils/response";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { departmentPostRuleService } from "@/services/department-post-rules";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";

function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

function buildPagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

type EmployeeLoginBindingStatus =
  | "none"
  | "web_only"
  | "wechat_only"
  | "web_and_wechat"
  | "other";

type EmployeeLoginBindingRpcRow = {
  employee_id: string;
  auth_user_id: string | null;
  has_admin_web: boolean | null;
  has_wechat_mini: boolean | null;
  wechat_openid_masked: string | null;
};

type TenantDepartmentWriteRow = {
  id: string;
  tenant_id: string | null;
  code: string;
  alias_name: string;
  enabled: boolean;
  legacy_department_id: string | null;
};

type EmployeeDepartmentWriteInput = {
  tenantId: string | null;
  departmentId?: string | null;
  tenantDepartmentId?: string | null;
};

type NormalizedEmployeeDepartment = {
  departmentId: string | null;
  tenantDepartmentId: string | null;
};

/**
 * 员工控制器类
 *
 * 提供以下接口：
 * - GET    /employees              - 获取员工列表
 * - GET    /employees/:id         - 获取单个员工
 * - POST   /employees             - 创建员工
 * - PUT    /employees/:id         - 更新员工 (兼容)
 * - PATCH  /employees/:id         - 更新员工
 * - GET    /employees/withdepartment        - 获取员工列表 (带部门信息)
 * - GET    /employees/withdepartment/:id   - 获取单个员工 (带部门信息)
 * - GET    /employees/withpost             - 获取员工列表 (带职位信息)
 *
 * @extends BaseController <CreateEmployeeSchema, UpdateEmployeeSchema>
 */
class EmployeeController extends BaseController<
  typeof CreateEmployeeSchema,
  typeof UpdateEmployeeSchema
> {
  constructor() {
    /**
     * 构造函数指定表名为 "employees"
     * BaseController 会自动处理该表的 CRUD 路由注册
     */
    super("employees", CreateEmployeeSchema, UpdateEmployeeSchema);
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  private applyEmployeeScope(query: any, scope: "self" | "department" | "assigned" | "all" | null, authContext: Awaited<ReturnType<EmployeeController["getRequiredAuthContext"]>>) {
    if (!scope) {
      throw Errors.forbidden();
    }

    if (scope === "all") {
      return query;
    }

    if (scope === "department") {
      const departmentScopeId = authContext.tenantDepartmentId || authContext.departmentId;
      if (!departmentScopeId) {
        return query.eq("id", "00000000-0000-0000-0000-000000000000");
      }

      return query.or(
        `tenant_department_id.eq.${departmentScopeId},department_id.eq.${departmentScopeId}`,
      );
    }

    if (!authContext.employeeId) {
      return query.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    return query.eq("id", authContext.employeeId);
  }

  private applyEmployeeListFilters(
    query: any,
    tenantId: string | null,
    scope: "self" | "department" | "assigned" | "all" | null,
    authContext: Awaited<ReturnType<EmployeeController["getRequiredAuthContext"]>>,
    status?: string,
    keyword?: string,
  ) {
    let filteredQuery = this.applyEmployeeScope(query, scope, authContext);

    if (tenantId) {
      filteredQuery = filteredQuery.eq("tenant_id", tenantId);
    }

    if (status) {
      filteredQuery = filteredQuery.eq("status", status);
    }

    if (keyword) {
      const escapedKeyword = escapeSupabaseOrValue(keyword);
      filteredQuery = filteredQuery.or(
        [
          `name.ilike.%${escapedKeyword}%`,
          `phone.ilike.%${escapedKeyword}%`,
        ].join(","),
      );
    }

    return filteredQuery;
  }

  private async listEmployeeLoginBindingRows(employeeIds: string[]) {
    if (employeeIds.length === 0) {
      return new Map<string, EmployeeLoginBindingRpcRow>();
    }

    const { data, error } = await (SupabaseDB.getAdminClient() as unknown as {
      rpc: (
        functionName: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("list_employee_login_bindings", {
      p_employee_ids: employeeIds,
    });

    if (error) {
      throw Errors.dbError("查询员工登录绑定失败", error);
    }

    const rows = Array.isArray(data)
      ? (data as EmployeeLoginBindingRpcRow[])
      : [];

    return new Map(rows.map((row) => [row.employee_id, row]));
  }

  private buildEmployeeLoginBindings(employee: Record<string, unknown>, row?: EmployeeLoginBindingRpcRow) {
    const hasAuthUser = Boolean(employee.user_id);
    const web = Boolean(row?.has_admin_web);
    const wechatMini = Boolean(row?.has_wechat_mini);
    let status: EmployeeLoginBindingStatus = "none";
    let label = "未开通登录";

    if (web && wechatMini) {
      status = "web_and_wechat";
      label = "后台 + 微信";
    } else if (web) {
      status = "web_only";
      label = "仅后台账号";
    } else if (wechatMini) {
      status = "wechat_only";
      label = "仅微信小程序";
    } else if (hasAuthUser) {
      status = "other";
      label = "其他登录账号";
    }

    return {
      status,
      label,
      web,
      wechat_mini: wechatMini,
      wechat_openid_masked: row?.wechat_openid_masked ?? null,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (Array.isArray(value)) {
      const first = value[0];
      return first && typeof first === "object"
        ? first as Record<string, unknown>
        : null;
    }

    return typeof value === "object"
      ? value as Record<string, unknown>
      : null;
  }

  private normalizeEmployeeDepartment<T extends object>(employee: T) {
    const source = employee as Record<string, unknown>;
    const tenantDepartment = this.asRecord(source.tenant_department);
    const legacyDepartment = this.asRecord(source.department);
    const tenantDepartmentId =
      typeof source.tenant_department_id === "string"
        ? source.tenant_department_id
        : typeof tenantDepartment?.id === "string"
          ? tenantDepartment.id
          : null;
    const departmentId =
      typeof source.department_id === "string"
        ? source.department_id
        : typeof tenantDepartment?.legacy_department_id === "string"
          ? tenantDepartment.legacy_department_id
          : null;
    const departmentName =
      typeof tenantDepartment?.alias_name === "string"
        ? tenantDepartment.alias_name
        : typeof legacyDepartment?.name === "string"
          ? legacyDepartment.name
          : null;
    const departmentCode =
      typeof tenantDepartment?.code === "string"
        ? tenantDepartment.code
        : typeof legacyDepartment?.code === "string"
          ? legacyDepartment.code
          : null;

    return {
      ...source,
      avatar: resolveStoredFileUrl(
        typeof source.avatar === "string" ? source.avatar : null,
      ),
      department_id: departmentId,
      tenant_department_id: tenantDepartmentId,
      department_name: departmentName,
      department_code: departmentCode,
      department: departmentName || departmentCode || departmentId
        ? {
          id: departmentId,
          tenant_department_id: tenantDepartmentId,
          name: departmentName,
          code: departmentCode,
        }
        : null,
    };
  }

  private employeeSelectWithDepartment(): "*" {
    return `
      *,
      tenant_department:tenant_departments!employees_tenant_department_id_fkey(
        id,
        code,
        alias_name,
        enabled,
        legacy_department_id
      ),
      department:departments!employees_department_id_fkey(
        id,
        code,
        name
      )
    ` as "*";
  }

  private async findTenantDepartmentForEmployee(input: EmployeeDepartmentWriteInput) {
    if (!input.tenantId) {
      throw Errors.badRequest("缺少租户上下文，无法选择部门");
    }

    let query = SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select("id, tenant_id, code, alias_name, enabled, legacy_department_id")
      .eq("tenant_id", input.tenantId)
      .eq("enabled", true);

    if (input.tenantDepartmentId) {
      query = query.eq("id", input.tenantDepartmentId);
    } else if (input.departmentId) {
      query = query.eq("legacy_department_id", input.departmentId);
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw Errors.dbError("查询部门失败", error);

    return data as TenantDepartmentWriteRow | null;
  }

  private async normalizeDepartmentForWrite(
    input: EmployeeDepartmentWriteInput,
  ): Promise<NormalizedEmployeeDepartment> {
    const hasDepartmentId = input.departmentId !== undefined;
    const hasTenantDepartmentId = input.tenantDepartmentId !== undefined;

    if (!hasDepartmentId && !hasTenantDepartmentId) {
      return {
        departmentId: null,
        tenantDepartmentId: null,
      };
    }

    if (input.departmentId === null || input.tenantDepartmentId === null) {
      if (
        (input.departmentId ?? null) !== null ||
        (input.tenantDepartmentId ?? null) !== null
      ) {
        throw Errors.badRequest("department_id 与 tenant_department_id 不匹配");
      }

      return {
        departmentId: null,
        tenantDepartmentId: null,
      };
    }

    const department = await this.findTenantDepartmentForEmployee(input);
    if (!department) {
      throw Errors.badRequest("部门不存在或未启用");
    }

    if (!department.legacy_department_id) {
      throw Errors.badRequest("部门缺少旧部门映射，暂不能分配员工");
    }

    if (
      input.departmentId &&
      department.legacy_department_id !== input.departmentId
    ) {
      throw Errors.badRequest("department_id 与 tenant_department_id 不匹配");
    }

    if (
      input.tenantDepartmentId &&
      department.id !== input.tenantDepartmentId
    ) {
      throw Errors.badRequest("department_id 与 tenant_department_id 不匹配");
    }

    return {
      departmentId: department.legacy_department_id,
      tenantDepartmentId: department.id,
    };
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "employee.read",
    );

    const queryResult = EmployeeListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, status, keyword } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const normalizedKeyword = keyword?.trim();

    let countQuery = SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select("id", { count: "exact", head: true });
    countQuery = this.applyEmployeeListFilters(
      countQuery,
      authContext.tenantId,
      scope,
      authContext,
      status,
      normalizedKeyword,
    );

    const { error: countError, count } = await countQuery;
    if (countError) throw Errors.dbError("列表查询失败", countError);

    const total = count ?? 0;
    if (from >= total) {
      return ResponseHandler.success({
        list: [],
        pagination: buildPagination(page, pageSize, total),
      });
    }

    let query = SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select(this.employeeSelectWithDepartment())
      .order("created_at", { ascending: false });
    query = this.applyEmployeeListFilters(
      query,
      authContext.tenantId,
      scope,
      authContext,
      status,
      normalizedKeyword,
    );

    const { data, error } = await query.range(from, to);

    if (error) throw Errors.dbError("列表查询失败", error);
    const employees = data || [];
    const bindingRows = await this.listEmployeeLoginBindingRows(
      employees.map((employee) => employee.id),
    );

    return ResponseHandler.success({
      list: employees.map((employee) => ({
        ...this.normalizeEmployeeDepartment(employee),
        login_bindings: this.buildEmployeeLoginBindings(
          employee,
          bindingRows.get(employee.id),
        ),
      })),
      pagination: buildPagination(page, pageSize, total),
    });
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.create");

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const department = await this.normalizeDepartmentForWrite({
      tenantId: authContext.tenantId,
      departmentId: result.data.department_id,
      tenantDepartmentId: result.data.tenant_department_id,
    });

    await departmentPostRuleService.assertEmployeeDepartmentPostAllowed({
      departmentId: department.departmentId,
      postId: result.data.post_id,
      tenantId: authContext.tenantId,
    });

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .insert({
        ...result.data,
        department_id: department.departmentId,
        tenant_department_id: department.tenantDepartmentId,
        tenant_id: authContext.tenantId ?? null,
      })
      .select(this.employeeSelectWithDepartment())
      .single();

    if (error) throw Errors.dbError("创建失败", error);
    return ResponseHandler.success(this.normalizeEmployeeDepartment(data));
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.update");

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const existing = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select("id, department_id, tenant_department_id, post_id, tenant_id")
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (existing.error) throw Errors.dbError("查询失败", existing.error);
    if (!existing.data) throw Errors.badRequest("员工不存在");

    if (!accessPolicyService.canAccessEmployee(authContext, existing.data, "employee.update")) {
      throw Errors.forbidden();
    }

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const shouldUpdateDepartment =
      result.data.department_id !== undefined ||
      result.data.tenant_department_id !== undefined;
    const department = shouldUpdateDepartment
      ? await this.normalizeDepartmentForWrite({
        tenantId: authContext.tenantId,
        departmentId: result.data.department_id,
        tenantDepartmentId: result.data.tenant_department_id,
      })
      : {
        departmentId: existing.data.department_id,
        tenantDepartmentId: existing.data.tenant_department_id,
      };
    const postId = result.data.post_id !== undefined
      ? result.data.post_id
      : existing.data.post_id;
    const departmentChanged = shouldUpdateDepartment &&
      (
        department.departmentId !== existing.data.department_id ||
        department.tenantDepartmentId !== existing.data.tenant_department_id
      );
    const postChanged =
      result.data.post_id !== undefined &&
      result.data.post_id !== existing.data.post_id;

    if (departmentChanged || postChanged) {
      await departmentPostRuleService.assertEmployeeDepartmentPostAllowed({
        departmentId: department.departmentId,
        postId,
        tenantId: authContext.tenantId,
      });
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .update({
        ...result.data,
        ...(shouldUpdateDepartment
          ? {
            department_id: department.departmentId,
            tenant_department_id: department.tenantDepartmentId,
          }
          : {}),
      })
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .select(this.employeeSelectWithDepartment())
      .single();

    if (error) throw Errors.dbError("更新失败", error);
    return ResponseHandler.success(this.normalizeEmployeeDepartment(data));
  };

  @Delete("/employees/:id")
  async deleteEmployee(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.update");

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const existing = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select("id, user_id, department_id, tenant_department_id, tenant_id")
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (existing.error) throw Errors.dbError("查询失败", existing.error);
    if (!existing.data) throw Errors.badRequest("员工不存在");

    if (!accessPolicyService.canAccessEmployee(authContext, existing.data, "employee.update")) {
      throw Errors.forbidden();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .update({
        status: "leaved",
        user_id: null,
      })
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .select()
      .single();

    if (error) throw Errors.dbError("删除员工失败", error);

    authorizationService.invalidateAuthContext({
      authUserId: existing.data.user_id,
      employeeId: existing.data.id,
    });

    return ResponseHandler.success(data, "删除成功");
  }

  // ==================== 基础 CRUD ====================
  // 继承自 BaseController:
  // - list()        : GET    /employees
  // - getById()     : GET    /employees/:id
  // - create()      : POST   /employees
  // - update()      : PUT/PATCH /employees/:id

  // ==================== 自定义查询 ====================

  /**
   * 获取所有员工及其部门信息
   *
   * @route GET /employees/withdepartment
   * @returns 员工列表，每条记录包含嵌套的 department 对象 (仅 name 字段)
   *
   * @example
   * // Response:
   * {
   *   "success": true,
   *   "data": [
   *     {
   *       "id": "uuid",
   *       "name": "张三",
   *       "department": { "name": "技术部" },
   *       ...
   *     }
   *   ]
   * }
   */
  @Get("/employees/withdepartment")
  async getEmployeesWithDepartment(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "employee.read",
    );

    let query = SupabaseDB.getAdminClient().from(this.tableName).select(`
        *,
        tenant_department:tenant_departments!employees_tenant_department_id_fkey (
          id,
          code,
          alias_name,
          enabled,
          legacy_department_id
        ),
        department:departments!employees_department_id_fkey (
          id,
          code,
          name
        )
      `);

    query = this.applyEmployeeScope(query, scope, authContext);
    if (authContext.tenantId) {
      query = query.eq("tenant_id", authContext.tenantId);
    }

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询失败", error);
    return ResponseHandler.success((data || []).map((employee) =>
      this.normalizeEmployeeDepartment(employee)
    ));
  }

  /**
   * 获取单个员工及其部门信息
   *
   * @route GET /employees/withdepartment/:id
   * @param request.params.id - 员工 UUID
   * @returns 单个员工记录，包含嵌套的 department 对象 (仅 name 字段)
   * @throws 400 - 参数校验失败 (无效 UUID)
   * @throws 404 - 员工不存在
   */
  @Get("/employees/withdepartment/:id")
  async getByIdwithDepartment(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);

    // 1. 校验 UUID 参数
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    // 2. 查询单条员工记录，联查部门信息
    const { data, error } = await SupabaseDB.getAdminClient().from(this.tableName)
      .select(`
        *,
        tenant_department:tenant_departments!employees_tenant_department_id_fkey (
          id,
          code,
          alias_name,
          enabled,
          legacy_department_id
        ),
        department:departments!employees_department_id_fkey (
          id,
          code,
          name
        )
      `)
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .single();

    // 3. 错误处理
    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在");
    if (!accessPolicyService.canAccessEmployee(authContext, data, "employee.read")) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(this.normalizeEmployeeDepartment(data));
  }

  /**
   * 获取所有员工及其职位信息
   *
   * @route GET /employees/withpost
   * @returns 员工列表，每条记录包含嵌套的 post 对象 (code 和 name 字段)
   *
   * @example
   * // Response:
   * {
   *   "success": true,
   *   "data": [
   *     {
   *       "id": "uuid",
   *       "name": "张三",
   *       "post": { "code": "P001", "name": "经理" },
   *       ...
   *     }
   *   ]
   * }
   */
  @Get("/employees/withpost")
  async getEmployeesWithPost(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "employee.read",
    );

    let query = SupabaseDB.getAdminClient().from(this.tableName).select(`
        *,
        post:posts (
          code,
          name
        )
      `);

    query = this.applyEmployeeScope(query, scope, authContext);
    if (authContext.tenantId) {
      query = query.eq("tenant_id", authContext.tenantId);
    }

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询失败", error);
    return ResponseHandler.success(data);
  }

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    let { data, error } = await SupabaseDB.getAdminClient().from(this.tableName)
      .select(this.employeeSelectWithDepartment())
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (!data && !error) {
      const fallback = await SupabaseDB.getAdminClient().from(this.tableName)
        .select(this.employeeSelectWithDepartment())
        .eq("user_id", idVerify.data.id)
        .eq("tenant_id", authContext.tenantId)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在", error);
    if (!accessPolicyService.canAccessEmployee(authContext, data, "employee.read")) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(this.normalizeEmployeeDepartment(data));
  };
}

/**
 * 单例导出
 * routes/factory.ts 的 createResourceRoutes() 期望接收实例而非类
 */
export default new EmployeeController();
