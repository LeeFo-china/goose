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

    return ResponseHandler.success(await propertySer.getProperty({
      id: idVerify.data.id,
      tenantId,
    }));
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const result = CreatePropertySchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    return ResponseHandler.success(await propertySer.createProperty({
      tenantId,
      payload: result.data,
    }));
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = UpdatePropertySchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    return ResponseHandler.success(await propertySer.updateProperty({
      id: idVerify.data.id,
      tenantId,
      payload: result.data,
    }));
  };
}

export default new PropertyController();
