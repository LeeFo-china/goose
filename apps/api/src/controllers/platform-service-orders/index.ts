import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformServiceEntityParamSchema,
  PlatformServiceOrderListQuerySchema,
} from "@/schema/platform-service-fulfillment";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

const SERVICE_MODULE = "../../services/platform-service-fulfillment";

async function service() {
  return (await import(SERVICE_MODULE)).platformServiceFulfillmentService;
}

class PlatformServiceOrdersController extends PlatformBaseController {
  constructor() {
    super("platform-service-orders");
  }

  @Get("/platform/billing/service-orders")
  async listOrders(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PlatformServiceOrderListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await (await service()).listOrders(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/service-orders/:id")
  async getOrder(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await (await service()).getOrder(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-orders/:id/shipping-report/retry")
  async retryOrderShippingReport(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await (await service()).retryOrderShippingReport(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformServiceOrdersController();
