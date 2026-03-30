import { BaseController } from "@/controllers/BaseController";
import { CreateEmployeeSchema, UpdateEmployeeSchema } from "@/schema/employee";
import { SupabaseDB } from "@/utils/supabase/index";
import type { Tables, Inserts, Updates } from "@/types/db";

// const employeeTable = SupabaseDB.from("employees");

class EmployeeController extends BaseController<
  typeof CreateEmployeeSchema,
  typeof UpdateEmployeeSchema
> {
  constructor() {
    super("employees", CreateEmployeeSchema, UpdateEmployeeSchema);
  }
}

export default new EmployeeController();
