import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import type { RouteHandlerMethod } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import { z } from "zod";

type TTableReturn = ReturnType<SupabaseClient["from"]>;

export abstract class BaseController<
  TCreate extends z.ZodTypeAny, // 创建时的 Zod Schema
  TUpdate extends z.ZodTypeAny, // 更新时的 Zod Schema
> {
  protected tableName: string;
  protected createSchema: TCreate;
  protected updateSchema: TUpdate;
  protected idParamSchema = z.object({ id: z.uuid("无效的 ID 格式") });

  constructor(tableName: string, createSchema: TCreate, updateSchema: TUpdate) {
    this.tableName = tableName;
    this.createSchema = createSchema;
    this.updateSchema = updateSchema;
  }

  /**
   * 获取单条记录
   */
  getById: RouteHandlerMethod = async (request, reply) => {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.from(this.tableName)
      .select()
      .eq("id", idVerify.data.id)
      .single();

    if (error) throw Errors.dbError("查询失败", error);
    if (!data) throw Errors.dbError("查询记录不存在", error);

    return { data };
  };

  /**
   * 获取列表
   */
  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { data, error } = await await SupabaseDB.from(this.tableName)
      .select()
      .order("created_at", { ascending: false });
    if (error) throw Errors.dbError("列表查询失败", error);
    return { data };
  };

  /**
   * 创建记录
   */
  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { data, error } = await await SupabaseDB.from(this.tableName)
      .insert(result.data)
      .select()
      .single();

    if (error) throw Errors.dbError("创建失败", error);
    return reply.status(201).send({ data });
  };

  /**
   * 更新记录
   */
  update = async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. 校验 ID
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    // 2. 校验 Body
    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const { data, error } = await await SupabaseDB.from(this.tableName)
      .update(result.data)
      .eq("id", idVerify.data.id)
      .select()
      .single();

    if (error) throw Errors.dbError("更新失败", error);
    return { data };
  };

  public abstract registerExtraRoutes: (
    fastify: FastifyInstance,
    tableName: string,
  ) => Promise<void>;
}
