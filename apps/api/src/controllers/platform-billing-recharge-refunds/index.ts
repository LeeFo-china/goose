import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformRechargeRefundRequestParamSchema,
  PlatformRechargeRefundRequestQuerySchema,
  PlatformRechargeRefundReviewSchema,
} from "@/schema/platform-billing-recharge-refunds";
import { platformBillingRechargeRefundService } from "@/services/platform-billing-recharge-refunds";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformBillingRechargeRefundController extends PlatformBaseController {
  constructor() {
    super("platform-billing-recharge-refunds");
  }

  @Get("/platform/billing/recharge-refund-requests")
  async listRequests(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PlatformRechargeRefundRequestQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await platformBillingRechargeRefundService.list(
        authContext,
        queryResult.data,
      ),
    );
  }

  @Get("/platform/billing/recharge-refund-requests/:id")
  async get(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformRechargeRefundRequestParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    return ResponseHandler.success(
      await platformBillingRechargeRefundService.get(
        authContext,
        paramsResult.data.id,
      ),
    );
  }

  @Post("/platform/billing/recharge-refund-requests/:id/approve")
  async approve(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformRechargeRefundRequestParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformRechargeRefundReviewSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await platformBillingRechargeRefundService.approve(
        authContext,
        paramsResult.data.id,
        bodyResult.data,
      ),
    );
  }

  @Post("/platform/billing/recharge-refund-requests/:id/reject")
  async reject(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformRechargeRefundRequestParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformRechargeRefundReviewSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await platformBillingRechargeRefundService.reject(
        authContext,
        paramsResult.data.id,
        bodyResult.data,
      ),
    );
  }

  @Post("/platform/billing/recharge-refund-requests/:id/execute")
  async execute(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformRechargeRefundRequestParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    return ResponseHandler.success(
      await platformBillingRechargeRefundService.execute(
        authContext,
        paramsResult.data.id,
      ),
    );
  }
}

export default new PlatformBillingRechargeRefundController();
