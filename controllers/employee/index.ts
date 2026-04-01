import { BaseController } from "@/controllers/BaseController";
import { CreateEmployeeSchema, UpdateEmployeeSchema } from "@/schema/employee";
import { SupabaseDB } from "@/utils/supabase/index";
import type { RouteHandlerMethod } from "fastify";
import type { FastifyInstance } from "fastify";
import { Errors } from "@/errors/error-factory";

import type { Tables, Inserts, Updates } from "@/types/db";

// const employeeTable = SupabaseDB.from("employees");

class EmployeeController extends BaseController<
  typeof CreateEmployeeSchema,
  typeof UpdateEmployeeSchema
> {
  constructor() {
    super("employees", CreateEmployeeSchema, UpdateEmployeeSchema);
  }

  public override registerExtraRoutes = async (
    app: FastifyInstance,
    tableName: string,
  ): Promise<void> => {
    // console.log()
    app.get(`/${tableName}/withdepartment/:id`, this.getByIdwithDepartment);
    app.get(`/${tableName}/withdepartment`, this.getEmployeesWithDepartment);
  };

  private getEmployeesWithDepartment: RouteHandlerMethod = async (
    request,
    reply,
  ) => {
    const { data, error } = await SupabaseDB.from(this.tableName).select(
      `
        *,
        department:departments (
          name
        )
      `,
    );

    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在", error);

    return { data };
  };

  private getByIdwithDepartment: RouteHandlerMethod = async (
    request,
    reply,
  ) => {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .select(
        `
        *,
        department:departments (
          name
        )
      `,
      )
      .eq("id", idVerify.data.id)
      .single();

    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在", error);

    return { data };
  };
}

export default new EmployeeController();
