import { BaseController } from "@/controllers/BaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  SubmitTenantOnboardingApplicationSchema,
  SupplementTenantOnboardingApplicationSchema,
  TenantOnboardingApplicationIdParamSchema,
  TenantOnboardingOwnedApplicationListQuerySchema,
  TenantOnboardingSendCodeSchema,
  WithdrawTenantOnboardingApplicationSchema,
} from "@/schema/tenant-onboarding";
import { tenantOnboardingApplicationsService } from "@/services/tenant-onboarding-applications";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";
import type { FastifyReply, FastifyRequest } from "fastify";

const MAX_IDEMPOTENCY_KEY_LENGTH = 120;
const MAX_DEVICE_ID_LENGTH = 160;

function requireVisitor(request: FastifyRequest) {
  const visitorId = request.user?.visitor_id?.trim();
  if (request.user?.token_type !== "visitor_session" || !visitorId) {
    throw Errors.unauthorized("需要 visitor 登录态");
  }
  return visitorId;
}

function requireIdempotencyKey(request: FastifyRequest) {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0]?.trim() : value?.trim();
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw Errors.business(
      400,
      "缺少有效的 Idempotency-Key",
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  return key;
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

class TenantOnboardingController extends BaseController {
  constructor() {
    super("tenant_onboarding_applications");
  }

  @Post("/tenant-onboarding/applications/send-code")
  async sendCode(request: FastifyRequest) {
    requireVisitor(request);
    const bodyResult = TenantOnboardingSendCodeSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await tenantOnboardingApplicationsService.sendCode({
      phone: bodyResult.data.phone,
      requestIp: resolveTrustedClientIp(request),
      requestDevice: resolveRequestDevice(request),
    });
    return ResponseHandler.success(data);
  }

  @Post("/tenant-onboarding/applications")
  async submit(request: FastifyRequest, reply: FastifyReply) {
    const visitorId = requireVisitor(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const bodyResult = SubmitTenantOnboardingApplicationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await tenantOnboardingApplicationsService.submit(
      bodyResult.data,
      { visitorId, idempotencyKey },
    );
    reply.code(202);
    return ResponseHandler.success(data);
  }

  @Get("/tenant-onboarding/applications/mine")
  async listOwned(request: FastifyRequest) {
    const visitorId = requireVisitor(request);
    const queryResult = TenantOnboardingOwnedApplicationListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await tenantOnboardingApplicationsService.listOwned({
      visitorId,
      ...queryResult.data,
    });
    return ResponseHandler.success(data);
  }

  @Get("/tenant-onboarding/applications/:id")
  async getOwned(request: FastifyRequest) {
    const visitorId = requireVisitor(request);
    const paramsResult = TenantOnboardingApplicationIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await tenantOnboardingApplicationsService.getOwned({
      applicationId: paramsResult.data.id,
      visitorId,
    });
    return ResponseHandler.success(data);
  }

  @Patch("/tenant-onboarding/applications/:id/supplement")
  async supplement(request: FastifyRequest) {
    const visitorId = requireVisitor(request);
    const paramsResult = TenantOnboardingApplicationIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = SupplementTenantOnboardingApplicationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const { version, ...patch } = bodyResult.data;

    const data = await tenantOnboardingApplicationsService.supplement({
      applicationId: paramsResult.data.id,
      visitorId,
      expectedVersion: version,
      patch,
    });
    return ResponseHandler.success(data);
  }

  @Post("/tenant-onboarding/applications/:id/withdraw")
  async withdraw(request: FastifyRequest) {
    const visitorId = requireVisitor(request);
    const paramsResult = TenantOnboardingApplicationIdParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = WithdrawTenantOnboardingApplicationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await tenantOnboardingApplicationsService.withdraw({
      applicationId: paramsResult.data.id,
      visitorId,
      expectedVersion: bodyResult.data.version,
      reason: bodyResult.data.reason,
    });
    return ResponseHandler.success(data);
  }
}

export default new TenantOnboardingController();
