import { BaseController } from "@/controllers/BaseController";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from "@/schema/departments";
import type { FastifyInstance } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";

// const employeeTable = SupabaseDB.from("departments");

class DepartmentController extends BaseController<
  typeof CreateDepartmentSchema,
  typeof UpdateDepartmentSchema
> {
  constructor() {
    super("departments", CreateDepartmentSchema, UpdateDepartmentSchema);
  }
}

export default new DepartmentController();
