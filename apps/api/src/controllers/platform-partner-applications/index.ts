import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ApprovePlatformPartnerApplicationSchema,
  PlatformPartnerApplicationIdParamSchema,
  PlatformPartnerApplicationListQuerySchema,
  PlatformPartnerApplicationSendCodeSchema,
  SubmitPlatformPartnerApplicationSchema,
  UpdatePlatformPartnerApplicationStatusSchema,
} from "@/schema/platform-partner-applications";
import { platformPartnerApplicationsService } from "@/services/platform-partner-applications";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";

class PlatformPartnerApplicationsController extends PlatformBaseController {
  constructor() {
    super("platform-partner-applications");
  }

  @Post("/public/partner-applications/send-code")
  async sendPublicApplicationCode(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const bodyResult = PlatformPartnerApplicationSendCodeSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) {
      throw this.createPublicApplicationValidationError(bodyResult.error);
    }

    const data = await platformPartnerApplicationsService
      .sendPublicApplicationCode({
        ...bodyResult.data,
        requestIp: resolveTrustedClientIp(request),
        requestDevice: this.getRequestDevice(request),
      });
    return ResponseHandler.success(data);
  }

  @Post("/public/partner-applications")
  async submitPublicApplication(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const bodyResult = SubmitPlatformPartnerApplicationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) {
      throw this.createPublicApplicationValidationError(bodyResult.error);
    }

    const data = await platformPartnerApplicationsService
      .submitPublicApplication(bodyResult.data);
    return ResponseHandler.success(data);
  }

  private createPublicApplicationValidationError(error: z.ZodError) {
    const field = error.issues[0]?.path[0];
    if (field === "phone") {
      return Errors.business(
        400,
        "请输入正确手机号",
        "INVALID_PHONE",
        error.issues,
      );
    }

    if (field === "sms_code") {
      return Errors.business(
        400,
        "验证码错误或已过期",
        "SMS_CODE_INVALID",
        error.issues,
      );
    }

    return Errors.fromZod(error);
  }

  private getRequestDevice(request: FastifyRequest) {
    const headerNames = [
      "x-device-id",
      "x-visitor-device-id",
      "x-client-device-id",
      "x-client-id",
    ];

    for (const headerName of headerNames) {
      const rawValue = request.headers[headerName];
      const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
      if (typeof value !== "string") continue;
      const normalized = value.trim();
      if (normalized) return normalized.slice(0, 160);
    }

    return null;
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
