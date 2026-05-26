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
import { Errors } from "@/errors/error-factory";
import { Delete, Get } from "@/utils/decorators/route";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ResponseHandler } from "@/utils/response";
import { authorizationService } from "@/services/authorization";
import {
  employeeCoreService,
  type EmployeeLoginBindingRow,
} from "@/services/employee-core";
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

  private buildEmployeeLoginBindings(employee: Record<string, unknown>, row?: EmployeeLoginBindingRow) {
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
    const tenantDepartmentId =
      typeof source.tenant_department_id === "string"
        ? source.tenant_department_id
        : typeof tenantDepartment?.id === "string"
          ? tenantDepartment.id
          : null;
    const departmentName =
      typeof tenantDepartment?.alias_name === "string"
        ? tenantDepartment.alias_name
        : null;
    const departmentCode =
      typeof tenantDepartment?.code === "string"
        ? tenantDepartment.code
        : null;

    return {
      ...source,
      avatar: resolveStoredFileUrl(
        typeof source.avatar === "string" ? source.avatar : null,
      ),
      tenant_department_id: tenantDepartmentId,
      department_name: departmentName,
      department_code: departmentCode,
      department: departmentName || departmentCode || tenantDepartmentId
        ? {
          id: tenantDepartmentId,
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

    const bindingRows = await employeeCoreService.listEmployeeLoginBindingMap(
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
    const employees = await employeeCoreService.listEmployeesWithDepartment({
      authContext,
    });

    return ResponseHandler.success(employees.map((employee) =>
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

    const employee = await employeeCoreService.getEmployeeWithDepartment({
      authContext,
      employeeId: idVerify.data.id,
    });

    return ResponseHandler.success(this.normalizeEmployeeDepartment(employee));
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
    const employees = await employeeCoreService.listEmployeesWithPost({
      authContext,
    });

    return ResponseHandler.success(employees);
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
