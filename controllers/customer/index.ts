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
import { PaginationQuerySchema } from "@/schema/request";

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
    request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>,
  ) {
    const { id } = request.params; // ← 这里拿到 UUID
    const queryResult = PaginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.from("customer_follow_ups")
      .select("*", { count: "exact" }).eq(
        "customer_id",
        id,
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("get customers data by id error", error);
    }

    return ResponseHandler.success({
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
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
