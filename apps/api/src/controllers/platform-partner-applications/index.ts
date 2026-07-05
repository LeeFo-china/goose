import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ApprovePlatformPartnerApplicationSchema,
  PlatformPartnerApplicationIdParamSchema,
  PlatformPartnerApplicationListQuerySchema,
  SubmitPlatformPartnerApplicationSchema,
  UpdatePlatformPartnerApplicationStatusSchema,
} from "@/schema/platform-partner-applications";
import { platformPartnerApplicationsService } from "@/services/platform-partner-applications";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformPartnerApplicationsController extends PlatformBaseController {
  constructor() {
    super("platform-partner-applications");
  }

  @Post("/public/partner-applications")
  async submitPublicApplication(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const bodyResult = SubmitPlatformPartnerApplicationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerApplicationsService
      .submitPublicApplication(bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/partner-applications")
  async listApplications(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PlatformPartnerApplicationListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerApplicationsService.listApplications(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/partner-applications/:id")
  async getApplication(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformPartnerApplicationIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformPartnerApplicationsService.getApplication(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/platform/partner-applications/:id/status")
  async updateApplicationStatus(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformPartnerApplicationIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdatePlatformPartnerApplicationStatusSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerApplicationsService
      .updateApplicationStatus(
        authContext,
        paramsResult.data.id,
        bodyResult.data,
      );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partner-applications/:id/approve")
  async approveApplication(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = PlatformPartnerApplicationIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ApprovePlatformPartnerApplicationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerApplicationsService.approveApplication(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformPartnerApplicationsController();
