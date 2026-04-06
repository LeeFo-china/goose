import { BaseController } from "@/controllers/BaseController";
import { CreateEmployeeSchema, UpdateEmployeeSchema } from "@/schema/employee";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import { Get, registerRoutes } from "@/utils/decorators/route"; // 导入装饰器
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ResponseHandler } from "@/utils/response";

class EmployeeController extends BaseController<
  typeof CreateEmployeeSchema,
  typeof UpdateEmployeeSchema
> {
  constructor() {
    super("employees");
  }

  /**
   * 插件入口
  //  */
  // public override registerExtraRoutes = async (fastify: FastifyInstance) => {
  //   // 1. 先注册 BaseController 的通用 CRUD 路由 (如果基类有的话)
  //   // 2. 自动扫描并注册带装饰器的路由
  //   registerRoutes(fastify, this);
  // };

  // 💡 使用装饰器定义路径
  // 注意：这里我们去掉了 private，改用普通方法，方便装饰器捕获
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

  @Get("/employees/withdepartment/:id")
  async getByIdwithDepartment(request: FastifyRequest, reply: FastifyReply) {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .select(`
        *,
        department:departments (
          name
        )
      `)
      .eq("id", idVerify.data.id)
      .single();

    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在");

    return ResponseHandler.success(data);
  }
}

// 导出实例
export default new EmployeeController();
