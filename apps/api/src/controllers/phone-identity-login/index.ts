import type { FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  PhoneIdentityLoginSelectSchema,
  PhoneIdentityLoginSendCodeSchema,
  PhoneIdentityLoginVerifySchema,
} from "@/schema/phone-identity-login";
import { phoneIdentityLoginService } from "@/services/phone-identity-login";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";

const MAX_DEVICE_ID_LENGTH = 160;

class PhoneIdentityLoginController extends BaseController {
  constructor() {
    super("phone_identity_login");
  }

  @Post("/auth/phone-login/send-code")
  async sendCode(request: FastifyRequest) {
    const bodyResult = PhoneIdentityLoginSendCodeSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await phoneIdentityLoginService.sendCode({
      input: bodyResult.data,
      request,
      requestIp: resolveTrustedClientIp(request),
      requestDevice: resolveRequestDevice(request),
    });
    return ResponseHandler.success(data, "验证码已发送");
  }

  @Post("/auth/phone-login/verify")
  async verify(request: FastifyRequest) {
    const bodyResult = PhoneIdentityLoginVerifySchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await phoneIdentityLoginService.verify({
      input: bodyResult.data,
      request,
    });
    return ResponseHandler.success(data, messageForResult(data.status));
  }

  @Post("/auth/phone-login/select")
  async select(request: FastifyRequest) {
    const bodyResult = PhoneIdentityLoginSelectSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await phoneIdentityLoginService.select({
      input: bodyResult.data,
      request,
    });
    return ResponseHandler.success(data, "登录成功");
  }
}

function resolveRequestDevice(request: FastifyRequest) {
  const headerNames = [
    "x-device-id",
    "x-visitor-device-id",
    "x-client-device-id",
    "x-client-id",
  ];
  for (const headerName of headerNames) {
    const raw = request.headers[headerName];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const normalized = value?.trim();
    if (normalized) return normalized.slice(0, MAX_DEVICE_ID_LENGTH);
  }
  return null;
}

function messageForResult(status: string) {
  if (status === "visitor_verified") {
    return "手机号验证成功，可提交装修需求";
  }
  if (status === "selection_required") {
    return "请选择登录身份";
  }
  return "登录成功";
}

export default new PhoneIdentityLoginController();
