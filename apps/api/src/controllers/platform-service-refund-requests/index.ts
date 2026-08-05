import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformServiceEntityParamSchema,
  PlatformServiceRefundRequestListQuerySchema,
  PlatformServiceRefundReviewSchema,
} from "@/schema/platform-service-fulfillment";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

const SERVICE_MODULE = "../../services/platform-service-fulfillment";

async function service() {
  return (await import(SERVICE_MODULE)).platformServiceFulfillmentService;
}

class PlatformServiceRefundRequestsController extends PlatformBaseController {
  constructor() {
    super("platform-service-refund-requests");
  }

  @Get("/platform/billing/service-refund-requests")
  async listRefundRequests(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_refund.review",
    );
    const queryResult = PlatformServiceRefundRequestListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await (await service()).listRefundRequests(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/service-refund-requests/:id/review")
  async reviewRefundRequest(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.service_refund.review",
    );
    const paramsResult = PlatformServiceEntityParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformServiceRefundReviewSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).reviewRefundRequest(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformServiceRefundRequestsController();
