import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Get, Post } from "@/utils/decorators/route";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import {
  AdminAuthLoginSchema,
  AdminAuthPhoneSchema,
} from "@/schema/admin-auth";
import { adminAuthService } from "@/services/admin-auth";
import {
  createAdminAuthLoginTimingSteps,
  logAdminAuthLoginTiming,
} from "@/services/admin-auth-login-timing";

function getErrorStatusCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return 500;
}

class AdminAuthController extends BaseController {
  constructor() {
    super("admin_auth");
  }

  @Post("/admin/auth/send-code")
  async sendCode(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = AdminAuthPhoneSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const result = await adminAuthService.sendCode({
      phone: bodyResult.data.phone,
      requestIp: request.ip,
    });

    return ResponseHandler.success(result, "验证码已发送");
  }

  @Post("/admin/auth/login")
  async login(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = AdminAuthLoginSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const startedAt = Date.now();
    const timingSteps = createAdminAuthLoginTimingSteps();
    let statusCode = 200;

    try {
      const result = await adminAuthService.login(bodyResult.data, {
        timingSteps,
      });

      return ResponseHandler.success(result, "登录成功");
    } catch (error) {
      statusCode = getErrorStatusCode(error);
      throw error;
    } finally {
      logAdminAuthLoginTiming(request, {
        startedAt,
        statusCode,
        steps: timingSteps,
      });
    }
  }

  @Get("/admin/auth/me")
  async me(request: FastifyRequest, reply: FastifyReply) {
    const result = await adminAuthService.me(request.user?.sub);

    return ResponseHandler.success(result);
  }
}

export default new AdminAuthController();
