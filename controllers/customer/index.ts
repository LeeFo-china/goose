import type { FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerSchema,
  UpdateCustomerSchema,
} from "@/schema/customer";
import { BaseController } from "@/controllers/BaseController";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FollowUpInsert } from "@/schema/customer";

// 继承基类
class CustomerController extends BaseController<
  typeof CreateCustomerSchema,
  typeof UpdateCustomerSchema
> {
  constructor() {
    super("customers", CreateCustomerSchema, UpdateCustomerSchema);
  }

  @Get("/customers/:id/detail")
  async getCustomerById(request: FastifyRequest<{ Params: { id: string } }>) {
    const { id } = request.params; // ← 这里拿到 UUID
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
  async getCustomerFollowUpById(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const { id } = request.params; // ← 这里拿到 UUID
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
  async createCustomerFollowUpById(
    request: FastifyRequest<{
      Params: { id: string };
      Body: FollowUpInsert;
    }>,
  ) {
    const { id } = request.params;
    const followUpData = request.body;
    const { data, error } = await SupabaseDB.from("customer_follow_ups")
      .insert({
        ...followUpData,
        customer_id: id,
      })
      .select()
      .single();

    if (error) {
      throw Errors.dbError("create follow up data error", error);
    }
    return ResponseHandler.success(data);
  }
}

export default new CustomerController(); // 导出实例
