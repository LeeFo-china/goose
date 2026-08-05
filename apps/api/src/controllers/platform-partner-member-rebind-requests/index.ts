import type { FastifyReply, FastifyRequest } from "fastify";
import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformPartnerMemberRebindIdParamSchema,
  PlatformPartnerMemberRebindListQuerySchema,
  ReviewPlatformPartnerMemberRebindRequestSchema,
} from "@/schema/platform-partner-member-rebind";
import { platformPartnerMemberRebindService } from "@/services/platform-partner-member-rebind";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class PlatformPartnerMemberRebindRequestsController extends PlatformBaseController {
  constructor() {
    super("platform-partner-member-rebind-requests");
  }

  @Get("/platform/partner-member-rebind-requests")
  async listRequests(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.partner.read",
    );
    const queryResult = PlatformPartnerMemberRebindListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerMemberRebindService.list(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partner-member-rebind-requests/:id/approve")
  async approveRequest(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.partner.manage",
    );
    const paramsResult = PlatformPartnerMemberRebindIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ReviewPlatformPartnerMemberRebindRequestSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerMemberRebindService.approve(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partner-member-rebind-requests/:id/reject")
  async rejectRequest(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.partner.manage",
    );
    const paramsResult = PlatformPartnerMemberRebindIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ReviewPlatformPartnerMemberRebindRequestSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerMemberRebindService.reject(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformPartnerMemberRebindRequestsController();
