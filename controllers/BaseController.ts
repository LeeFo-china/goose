import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RouteHandlerMethod } from "fastify";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import { z } from "zod";
import { registerRoutes } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { PaginationQuerySchema } from "@/schema/request";

export abstract class BaseController<
  TCreate extends z.ZodTypeAny = any, // 创建时的 Zod Schema
  TUpdate extends z.ZodTypeAny = any, // 更新时的 Zod Schema
  T = any,
> {
  protected tableName: string;
  protected createSchema: TCreate | null;
  protected updateSchema: TUpdate | null;
  protected idParamSchema = z.object({ id: z.uuid("无效的 ID 格式") });
  protected paginationQuerySchema = PaginationQuerySchema;

  constructor(
    tableName: string,
    createSchema: TCreate | null = null,
    updateSchema: TUpdate | null = null,
  ) {
    this.tableName = tableName;
    this.createSchema = createSchema;
    this.updateSchema = updateSchema;
  }

  getById: RouteHandlerMethod = async (request, reply) => {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .select()
      .eq("user_id", idVerify.data.id)
      .maybeSingle();

    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在", error);

    return ResponseHandler.success<T>(data);
  };

  /**
   * 获取列表
   */
  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = this.paginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.from(this.tableName)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("列表查询失败", error);
    return ResponseHandler.success({
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  };

  /**
   * 创建记录
   */
  create = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .insert(result.data)
      .select()
      .single();

    if (error) throw Errors.dbError("创建失败", error);
    return ResponseHandler.success<T>(data);
  };

  /**
   * 更新记录
   */
  update = async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. 校验 ID
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    // 2. 校验 Body

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .update(result.data)
      .eq("id", idVerify.data.id)
      .select()
      .single();

    if (error) throw Errors.dbError("更新失败", error);
    return ResponseHandler.success<T>(data);
  };

  public registerExtraRoutes = (
    fastify: FastifyInstance,
    tableName: string = "",
  ) => {
    registerRoutes(fastify, this);
  };
}
