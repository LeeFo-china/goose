import { BaseController } from "@/controllers/BaseController";
import {
  CreatePropertySchema,
  PropertyListQuerySchema,
  UpdatePropertySchema,
} from "@/schema/properties";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { propertySer } from "@/services/properties";
import type { FastifyReply, FastifyRequest } from "fastify";
import { authorizationService } from "@/services/authorization";
import { SupabaseDB } from "@/utils/supabase/index";
// import type { Tables, Inserts, Updates } from "@/types/db";

class PropertyController extends BaseController<
  typeof CreatePropertySchema,
  typeof UpdatePropertySchema
> {
  constructor() {
    super("properties", CreatePropertySchema, UpdatePropertySchema);
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const queryResult = PropertyListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await propertySer.listProperties(
      queryResult.data,
      authContext.tenantId,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select("*")
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询房产失败", error);
    if (!data) throw Errors.badRequest("房产不存在");
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const result = CreatePropertySchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    if (result.data.customer_id) {
      const customer = await SupabaseDB.getAdminClient()
        .from("customers")
        .select("id")
        .eq("id", result.data.customer_id)
        .eq("tenant_id", authContext.tenantId)
        .maybeSingle();
      if (customer.error) throw Errors.dbError("校验房产客户失败", customer.error);
      if (!customer.data) throw Errors.badRequest("客户不存在或不属于当前租户");
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .insert({
        ...result.data,
        tenant_id: authContext.tenantId ?? null,
      })
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建房产失败", error);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = UpdatePropertySchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);
    const { id: _bodyId, ...payload } = result.data;

    if (payload.customer_id) {
      const customer = await SupabaseDB.getAdminClient()
        .from("customers")
        .select("id")
        .eq("id", payload.customer_id)
        .eq("tenant_id", authContext.tenantId)
        .maybeSingle();
      if (customer.error) throw Errors.dbError("校验房产客户失败", customer.error);
      if (!customer.data) throw Errors.badRequest("客户不存在或不属于当前租户");
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .update(payload)
      .eq("id", idVerify.data.id)
      .eq("tenant_id", authContext.tenantId)
      .select("*")
      .maybeSingle();

    if (error) throw Errors.dbError("更新房产失败", error);
    if (!data) throw Errors.badRequest("房产不存在或更新失败");
    return ResponseHandler.success(data);
  };
}

export default new PropertyController();
