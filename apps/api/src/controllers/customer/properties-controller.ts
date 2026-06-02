import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerPropertySchema,
  CustomerPropertyDetailParamsSchema,
  CustomerPropertyParamsSchema,
  UpdateCustomerPropertySchema,
} from "@/schema/properties";
import { customerPropertyService } from "@/services/customer-properties";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { CustomerBaseController } from "./shared";

class CustomerPropertiesController extends CustomerBaseController {
  @Get("/customers/:customerId/properties")
  async listCustomerProperties(
    request: FastifyRequest<{ Params: { customerId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    return ResponseHandler.success(
      await customerPropertyService.listCustomerProperties({
        authContext,
        customerId: paramsResult.data.customerId,
      }),
    );
  }

  @Post("/customers/:customerId/properties")
  async createCustomerProperty(
    request: FastifyRequest<{ Params: { customerId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = CreateCustomerPropertySchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await customerPropertyService.createCustomerProperty({
        authContext,
        customerId: paramsResult.data.customerId,
        payload: bodyResult.data,
      }),
    );
  }

  @Post("/customers/:customerId/properties/:propertyId/primary")
  async setCustomerPrimaryProperty(
    request: FastifyRequest<{ Params: { customerId: string; propertyId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    return ResponseHandler.success(
      await customerPropertyService.setCustomerPrimaryProperty({
        authContext,
        customerId: paramsResult.data.customerId,
        propertyId: paramsResult.data.propertyId,
      }),
    );
  }

  @Patch("/customers/:customerId/properties/:propertyId")
  async updateCustomerProperty(
    request: FastifyRequest<{ Params: { customerId: string; propertyId: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerPropertyDetailParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateCustomerPropertySchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await customerPropertyService.updateCustomerProperty({
        authContext,
        customerId: paramsResult.data.customerId,
        propertyId: paramsResult.data.propertyId,
        payload: bodyResult.data,
      }),
    );
  }
}

export default new CustomerPropertiesController();
