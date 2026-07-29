import type { FastifyReply, FastifyRequest } from "fastify";

import { BaseController } from "@/controllers/BaseController";
import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  CreateTenantOnboardingOcrRecognitionSchema,
  TenantOnboardingOcrRecognitionParamsSchema,
} from "@/schema/tenant-onboarding-ocr";
import { tenantOnboardingOcrService } from "@/services/ocr";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";

class TenantOnboardingOcrController extends BaseController {
  constructor() {
    super("ocr_recognitions");
  }

  @Get("/tenant-onboarding/ocr/capabilities")
  async listCapabilities(request: FastifyRequest) {
    requireVisitor(request);
    // This server-owned auxiliary catalog is guaranteed to contain one entry.
    return ResponseHandler.success(
      await tenantOnboardingOcrService.listCapabilities(),
    );
  }

  @Post("/tenant-onboarding/ocr/recognitions")
  async createRecognition(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const visitorId = requireVisitor(request);
    const parsed = CreateTenantOnboardingOcrRecognitionSchema.safeParse(
      request.body ?? {},
    );
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const requestIp = resolveTrustedClientIp(request);
    if (!requestIp) {
      throw Errors.business(
        400,
        "无法识别客户端 IP",
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    try {
      return ResponseHandler.success(
        await tenantOnboardingOcrService.recognize(
          { visitorId, requestIp },
          parsed.data,
        ),
      );
    } catch (error) {
      setRetryAfter(reply, error);
      throw error;
    }
  }

  @Get("/tenant-onboarding/ocr/recognitions/:id")
  async getRecognition(request: FastifyRequest) {
    const visitorId = requireVisitor(request);
    const parsed = TenantOnboardingOcrRecognitionParamsSchema.safeParse(
      request.params ?? {},
    );
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    return ResponseHandler.success(
      await tenantOnboardingOcrService.getRecognitionResult(
        visitorId,
        parsed.data.id,
      ),
    );
  }
}

function requireVisitor(request: FastifyRequest) {
  const visitorId = request.user?.visitor_id?.trim();
  if (request.user?.token_type !== "visitor_session" || !visitorId) {
    throw Errors.unauthorized("需要 visitor 登录态");
  }
  return visitorId;
}

function setRetryAfter(reply: FastifyReply, error: unknown) {
  if (!(error instanceof AppError) || error.statusCode !== 429) return;
  if (
    !error.details ||
    typeof error.details !== "object" ||
    !("retry_after_seconds" in error.details)
  ) return;
  const retryAfter = Number(error.details.retry_after_seconds);
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return;
  reply.header("Retry-After", String(Math.max(1, Math.floor(retryAfter))));
}

export default new TenantOnboardingOcrController();
