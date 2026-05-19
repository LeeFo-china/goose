import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  CreatePropertySchema,
  PropertyListQuerySchema,
  UpdatePropertySchema,
} from "@/schema/properties";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { propertySer } from "@/services/properties";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";
// import type { Tables, Inserts, Updates } from "@/types/db";

class PropertyController extends TenantBaseController<
  typeof CreatePropertySchema,
  typeof UpdatePropertySchema
> {
  constructor() {
    super("properties", CreatePropertySchema, UpdatePropertySchema);
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const queryResult = PropertyListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await propertySer.listProperties(
      queryResult.data,
      tenantId,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .select("*")
      .eq("id", idVerify.data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询房产失败", error);
    if (!data) throw Errors.badRequest("房产不存在");
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const result = CreatePropertySchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    if (result.data.customer_id) {
      const customer = await SupabaseDB.getAdminClient()
        .from("customers")
        .select("id")
        .eq("id", result.data.customer_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (customer.error) throw Errors.dbError("校验房产客户失败", customer.error);
      if (!customer.data) throw Errors.badRequest("客户不存在或不属于当前租户");
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .insert({
        ...result.data,
        tenant_id: tenantId,
      })
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建房产失败", error);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
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
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (customer.error) throw Errors.dbError("校验房产客户失败", customer.error);
      if (!customer.data) throw Errors.badRequest("客户不存在或不属于当前租户");
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("properties")
      .update(payload)
      .eq("id", idVerify.data.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .maybeSingle();

    if (error) throw Errors.dbError("更新房产失败", error);
    if (!data) throw Errors.badRequest("房产不存在或更新失败");
    return ResponseHandler.success(data);
  };
}

export default new PropertyController();
