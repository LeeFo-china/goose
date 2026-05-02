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
// import type { Tables, Inserts, Updates } from "@/types/db";

class PropertyController extends BaseController<
  typeof CreatePropertySchema,
  typeof UpdatePropertySchema
> {
  constructor() {
    super("properties", CreatePropertySchema, UpdatePropertySchema);
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = PropertyListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await propertySer.listProperties(queryResult.data);
    return ResponseHandler.success(data);
  };
}

export default new PropertyController();
