import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformLeadAssignSchema,
  PlatformLeadIdParamsSchema,
  PlatformLeadListQuerySchema,
  PlatformLeadSubmitSchema,
} from "@/schema/platform-leads";
import { authorizationService } from "@/services/authorization";
import { platformLeadService } from "@/services/platform-leads";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformLeadsController extends BaseController {
  constructor() {
    super("platform_leads");
  }

  @Post("/platform/leads")
  async submitVisitorLead(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PlatformLeadSubmitSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformLeadService.submitVisitorLead(bodyResult.data, {
      authUserId: request.user?.sub,
      verifiedPhone: request.user?.verified_phone,
    });

    return ResponseHandler.success(data);
  }

  @Get("/platform/leads")
  async listLeads(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const queryResult = PlatformLeadListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformLeadService.list(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/leads/:id")
  async getLead(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const paramsResult = PlatformLeadIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformLeadService.getDetail(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/leads/:id/assign")
  async assignLead(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const paramsResult = PlatformLeadIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = PlatformLeadAssignSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformLeadService.assign(
      paramsResult.data.id,
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformLeadsController();
