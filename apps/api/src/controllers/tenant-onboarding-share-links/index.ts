import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantOnboardingShareLinkCreateSchema,
  TenantOnboardingShareLinkIdParamSchema,
  TenantOnboardingShareLinkIdempotencyKeySchema,
  TenantOnboardingShareLinkListQuerySchema,
  TenantOnboardingShareTokenParamSchema,
} from "@/schema/tenant-onboarding-share-links";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { platformAuthorizationService } from "@/services/platform-authorization";
import { tenantOnboardingShareLinksService } from "@/services/tenant-onboarding-share-links";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

function requireVisitor(request: FastifyRequest) {
  const visitorId = request.user?.visitor_id?.trim();
  if (request.user?.token_type !== "visitor_session" || !visitorId) {
    throw Errors.unauthorized("需要 visitor 登录态");
  }
  return visitorId;
}

function requireUuidIdempotencyKey(request: FastifyRequest) {
  const raw = request.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const result = TenantOnboardingShareLinkIdempotencyKeySchema.safeParse(
    value?.trim(),
  );
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

class TenantOnboardingShareLinksController extends BaseController {
  constructor() {
    super("tenant_onboarding_share_links");
  }

  @Post("/tenant-onboarding/share-links")
  async createShareLink(request: FastifyRequest) {
    const authContext = await this.getEmployeeContext(request);
    const bodyResult = TenantOnboardingShareLinkCreateSchema.safeParse(
      request.body ?? {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await tenantOnboardingShareLinksService.create({
      authContext,
      openid: request.user?.openid?.trim() || null,
      idempotencyKey: requireUuidIdempotencyKey(request),
    });
    return ResponseHandler.success(data);
  }

  @Post("/tenant-onboarding/share-links/:token/open")
  async recordOpen(request: FastifyRequest) {
    const visitorId = requireVisitor(request);
    const paramsResult = TenantOnboardingShareTokenParamSchema.safeParse(
      request.params ?? {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const data = await tenantOnboardingShareLinksService.recordOpen({
      token: paramsResult.data.token,
      visitorId,
    });
    return ResponseHandler.success(data);
  }

  @Get("/tenant-onboarding/share-links")
  async listShareLinks(request: FastifyRequest) {
    const authContext = await this.getEmployeeContext(request);
    const queryResult = TenantOnboardingShareLinkListQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await tenantOnboardingShareLinksService.list({
      authContext,
      page: queryResult.data.page,
      pageSize: queryResult.data.pageSize,
    });
    return ResponseHandler.success(data);
  }

  @Get("/tenant-onboarding/share-links/:id/applications")
  async listApplications(request: FastifyRequest) {
    const authContext = await this.getEmployeeContext(request);
    const paramsResult = TenantOnboardingShareLinkIdParamSchema.safeParse(
      request.params ?? {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = TenantOnboardingShareLinkListQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await tenantOnboardingShareLinksService.listApplications({
      authContext,
      shareLinkId: paramsResult.data.id,
      page: queryResult.data.page,
      pageSize: queryResult.data.pageSize,
    });
    return ResponseHandler.success(data);
  }

  private async getEmployeeContext(request: FastifyRequest): Promise<AuthContext> {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    if (!authContext.employeeId) throw Errors.forbidden();
    const verified = authContext.tenantId === null
      ? await platformAuthorizationService.assertPlatformSession(
        authContext,
        request.user?.admin_auth_version,
      )
      : authContext;
    request.authContext = verified;
    return verified;
  }
}

export default new TenantOnboardingShareLinksController();
