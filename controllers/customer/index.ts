import type { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import type { Inserts, Tables, Updates } from "@/types/db";
import type {
  CreateCustomerSchemaType,
  CustomerSchemaType,
  UpdateCustomerSchemaType,
} from "@/schema/customer";
import {
  CreateCustomerSchema,
  CustomerSchema,
  UpdateCustomerSchema,
} from "@/schema/customer";

import { BaseController } from "@/controllers/BaseController";
import type { FastifyInstance } from "fastify";
import { IdParamSchema } from "@/schema/request";

const customerTableName = "customers" as const;

// const customerTable = SupabaseDB.from("customers");

// 继承基类
class CustomerController extends BaseController<
  typeof CreateCustomerSchema,
  typeof UpdateCustomerSchema,
  typeof CustomerSchema
> {
  constructor() {
    super("customers", CreateCustomerSchema, UpdateCustomerSchema);
  }
}

export default new CustomerController(); // 导出实例
