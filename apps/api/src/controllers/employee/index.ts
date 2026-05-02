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
      if (!authContext.departmentId) {
        return query.eq("id", "00000000-0000-0000-0000-000000000000");
      }

      return query.eq("department_id", authContext.departmentId);
    }

    if (!authContext.employeeId) {
      return query.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    return query.eq("id", authContext.employeeId);
  }

  private applyEmployeeListFilters(
    query: any,
    scope: "self" | "department" | "assigned" | "all" | null,
    authContext: Awaited<ReturnType<EmployeeController["getRequiredAuthContext"]>>,
    status?: string,
    keyword?: string,
  ) {
    let filteredQuery = this.applyEmployeeScope(query, scope, authContext);

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
      .select("*")
      .order("created_at", { ascending: false });
    query = this.applyEmployeeListFilters(
      query,
      scope,
      authContext,
      status,
      normalizedKeyword,
    );

    const { data, error } = await query.range(from, to);

    if (error) throw Errors.dbError("列表查询失败", error);
    return ResponseHandler.success({
      list: data || [],
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

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .insert(result.data)
      .select()
      .single();

    if (error) throw Errors.dbError("创建失败", error);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.update");

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const existing = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select("id, department_id")
      .eq("id", idVerify.data.id)
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

    const { data, error } = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .update(result.data)
      .eq("id", idVerify.data.id)
      .select()
      .single();

    if (error) throw Errors.dbError("更新失败", error);
    return ResponseHandler.success(data);
  };

  @Delete("/employees/:id")
  async deleteEmployee(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.update");

    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const existing = await SupabaseDB.getAdminClient()
      .from(this.tableName)
      .select("id, user_id, department_id")
      .eq("id", idVerify.data.id)
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
        department:departments (
          name
        )
      `);

    query = this.applyEmployeeScope(query, scope, authContext);

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询失败", error);
    return ResponseHandler.success(data);
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
        department:departments (
          name
        )
      `)
      .eq("id", idVerify.data.id)
      .single();

    // 3. 错误处理
    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在");
    if (!accessPolicyService.canAccessEmployee(authContext, data, "employee.read")) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(data);
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

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询失败", error);
    return ResponseHandler.success(data);
  }

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    let { data, error } = await SupabaseDB.getAdminClient().from(this.tableName)
      .select()
      .eq("id", idVerify.data.id)
      .maybeSingle();

    if (!data && !error) {
      const fallback = await SupabaseDB.getAdminClient().from(this.tableName)
        .select()
        .eq("user_id", idVerify.data.id)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在", error);
    if (!accessPolicyService.canAccessEmployee(authContext, data, "employee.read")) {
      throw Errors.forbidden();
    }

    return ResponseHandler.success(data);
  };
}

/**
 * 单例导出
 * routes/factory.ts 的 createResourceRoutes() 期望接收实例而非类
 */
export default new EmployeeController();
