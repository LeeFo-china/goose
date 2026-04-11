/**
 * 员工控制器 (Employee Controller)
 *
 * 提供员工数据的 CRUD 操作及自定义查询接口。
 * 继承 BaseController，使用 Zod 进行参数校验。
 *
 * @module controllers/employee
 */

import { BaseController } from "@/controllers/BaseController";
import { CreateEmployeeSchema, UpdateEmployeeSchema } from "@/schema/employee";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import { Get } from "@/utils/decorators/route";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ResponseHandler } from "@/utils/response";

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
 * @extends BaseController<CreateEmployeeSchema, UpdateEmployeeSchema>
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
    const { data, error } = await SupabaseDB.from(this.tableName).select(`
        *,
        department:departments (
          name
        )
      `);

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
    // 1. 校验 UUID 参数
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    // 2. 查询单条员工记录，联查部门信息
    const { data, error } = await SupabaseDB.from(this.tableName)
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
    const { data, error } = await SupabaseDB.from(this.tableName).select(`
        *,
        post:posts (
          code,
          name
        )
      `);

    if (error) throw Errors.dbError("查询失败", error);
    return ResponseHandler.success(data);
  }
}

/**
 * 单例导出
 * routes/factory.ts 的 createResourceRoutes() 期望接收实例而非类
 */
export default new EmployeeController();
