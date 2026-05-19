/**
 * 员工控制器 (Employee Controller)
 *
 * 提供员工数据的 CRUD 操作及自定义查询接口。
 * 继承 TenantBaseController，使用 Zod 进行参数校验。
 *
 * @module controllers/employee
 */

import { TenantBaseController } from "@/controllers/TenantBaseController";
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
import {
  authorizationService,
  type AuthContext,
} from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { employeeCoreService } from "@/services/employee-core";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";

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
 * @extends TenantBaseController <CreateEmployeeSchema, UpdateEmployeeSchema>
 */
type TenantEmployeeAuthContext = AuthContext & { tenantId: string };

class EmployeeController extends TenantBaseController<
  typeof CreateEmployeeSchema,
  typeof UpdateEmployeeSchema
> {
  constructor() {
    /**
     * 构造函数指定表名为 "employees"
     * 路由层显式声明员工 CRUD 暴露，controller 内完成租户上下文校验。
     */
    super("employees", CreateEmployeeSchema, UpdateEmployeeSchema);
  }

  private applyEmployeeScope(
    query: any,
    scope: "self" | "department" | "assigned" | "all" | null,
    authContext: TenantEmployeeAuthContext,
  ) {
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

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = EmployeeListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await employeeCoreService.listEmployees({
      authContext,
      query: queryResult.data,
    });

    const bindingRows = await this.listEmployeeLoginBindingRows(
      result.rows.map((employee) => employee.id),
    );

    return ResponseHandler.success({
      list: result.rows.map((employee) => ({
        ...this.normalizeEmployeeDepartment(employee),
        login_bindings: this.buildEmployeeLoginBindings(
          employee,
          bindingRows.get(employee.id),
        ),
      })),
      pagination: buildPagination(result.page, result.pageSize, result.total),
    });
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);

    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const employee = await employeeCoreService.createEmployee({
      authContext,
      payload: result.data,
    });

    return ResponseHandler.success(this.normalizeEmployeeDepartment(employee));
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const employee = await employeeCoreService.updateEmployee({
      authContext,
      employeeId: idVerify.data.id,
      payload: result.data,
    });

    return ResponseHandler.success(this.normalizeEmployeeDepartment(employee));
  };

  @Delete("/employees/:id")
  async deleteEmployee(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = await employeeCoreService.disableEmployee({
      authContext,
      employeeId: idVerify.data.id,
    });

    authorizationService.invalidateAuthContext(result.invalidatedAuth);

    return ResponseHandler.success(result.employee, "删除成功");
  }

  // ==================== 基础 CRUD ====================
  // 通过 routes/index.ts 显式注册:
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
    const authContext = await this.getRequiredTenantContext(request);
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
    query = query.eq("tenant_id", authContext.tenantId);

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
    const authContext = await this.getRequiredTenantContext(request);

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
    const authContext = await this.getRequiredTenantContext(request);
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
    query = query.eq("tenant_id", authContext.tenantId);

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询失败", error);
    return ResponseHandler.success(data);
  }

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const employee = await employeeCoreService.getEmployeeDetail({
      authContext,
      employeeIdOrUserId: idVerify.data.id,
    });

    return ResponseHandler.success(this.normalizeEmployeeDepartment(employee));
  };
}

/**
 * 单例导出
 * routes/factory.ts 的 createResourceRoutes() 期望接收实例而非类
 */
export default new EmployeeController();
