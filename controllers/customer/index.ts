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
import { Get, Post, registerRoutes } from "@/utils/decorators/route";
import { fail, ResponseHandler, success } from "@/utils/response";
import type { FollowUpInsert } from "@/schema/customer";

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

  @Get("/customers/:id/detail")
  async getCustomerById(request: any, reply: any) {
    const { id } = request.params; // ← 这里拿到 UUID
    // id = "e3cfba5b-9808-40f2-b931-e72c5d9f5873"
    const { data, error } = await SupabaseDB.from("customers").select().eq(
      "id",
      id,
    ).single();

    if (error) {
      throw Errors.dbError("get customers data by id error", error);
    }

    return ResponseHandler.success(data);
  }

  @Get("/customers/:id/follow_ups")
  async getCustomerFollowUpById(request: any, reply: any) {
    const { id } = request.params; // ← 这里拿到 UUID
    // id = "e3cfba5b-9808-40f2-b931-e72c5d9f5873"
    const { data, error } = await SupabaseDB.from("customer_follow_ups")
      .select().eq(
        "customer_id",
        id,
      );

    if (error) {
      throw Errors.dbError("get customers data by id error", error);
    }

    return ResponseHandler.success(data);
  }

  @Post("/customers/:id/follow_ups")
  async createCustomerFollowUpById(request: FastifyRequest, reply: any) {
    const { id } = request.params as { id: string }; // ← 这里拿到 UUID
    const followUpData = request.body as FollowUpInsert;
    // id = "e3cfba5b-9808-40f2-b931-e72c5d9f5873"
    const { data, error } = await SupabaseDB.from("customer_follow_ups")
      .insert(followUpData).select().single();

    if (error) {
      throw Errors.dbError("create follow up data error", error);
    }
    console.log(error);
    return ResponseHandler.success(data);
  }
}

export default new CustomerController(); // 导出实例
