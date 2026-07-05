import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  PartnerAuthBindPhoneSchema,
  PartnerAuthLoginSchema,
  PartnerAuthSendCodeSchema,
} from "@/schema/platform-partner-portal";
import { platformPartnerPortalService } from "@/services/platform-partner-portal";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class PlatformPartnerPortalController extends BaseController {
  constructor() {
    super("platform-partner-portal");
  }

  @Post("/partner/auth/login")
  async login(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthLoginSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerPortalService.login({
      ...bodyResult.data,
      request,
    });
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/send-code")
  async sendCode(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthSendCodeSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerPortalService.sendCode({
      ...bodyResult.data,
      requestIp: request.ip ?? null,
    });
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/bind-phone")
  async bindPhone(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthBindPhoneSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerPortalService.bindPhone({
      ...bodyResult.data,
      request,
    });
    return ResponseHandler.success(data);
  }

  @Get("/partner/auth/me")
  async me(request: FastifyRequest, reply: FastifyReply) {
    const data = await platformPartnerPortalService.me(request.user);
    return ResponseHandler.success(data);
  }
}

export default new PlatformPartnerPortalController();
