import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ApproveTenantOnboardingApplicationSchema,
  RejectTenantOnboardingApplicationSchema,
  RequestSupplementTenantOnboardingApplicationSchema,
  RequestTenantOnboardingPartnerAssistSchema,
  PublishTenantServiceProviderProfileSchema,
  ReturnTenantServiceProviderProfileToDraftSchema,
  RetryTenantOnboardingNotificationSchema,
  StartReviewTenantOnboardingApplicationSchema,
  SuspendTenantServiceProviderProfileSchema,
  TenantOnboardingApplicationIdParamSchema,
  TenantOnboardingApplicationListQuerySchema,
  TenantOnboardingNotificationIdParamSchema,
  TenantOnboardingNotificationListQuerySchema,
  TenantOnboardingReviewListQuerySchema,
  TenantServiceProviderAreaListQuerySchema,
  TenantServiceProviderPublicationListQuerySchema,
  TenantServiceProviderPublicationParamSchema,
} from "@/schema/tenant-onboarding";
import { tenantOnboardingReviewService } from "@/services/tenant-onboarding-review";
import { tenantServiceProvidersService } from "@/services/tenant-service-providers";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class PlatformTenantOnboardingController extends PlatformBaseController {
  constructor() {
    super("platform_tenant_onboarding");
  }

  @Get("/platform/tenant-onboarding/applications")
  async listApplications(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const query = this.parse(TenantOnboardingApplicationListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.list(authContext, query),
    );
  }

  @Get("/platform/tenant-onboarding/applications/:id")
  async getApplication(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.get(authContext, params.id),
    );
  }

  @Get("/platform/tenant-onboarding/applications/:id/reviews")
  async listReviews(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    const query = this.parse(TenantOnboardingReviewListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.listReviews(authContext, params.id, query),
    );
  }

  @Get("/platform/tenant-onboarding/applications/:id/notifications")
  async listNotifications(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    const query = this.parse(TenantOnboardingNotificationListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.listNotifications(
        authContext,
        params.id,
        query,
      ),
    );
  }

  @Post("/platform/tenant-onboarding/applications/:id/license-access")
  async accessLicense(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.accessLicense(authContext, params.id),
    );
  }

  @Post("/platform/tenant-onboarding/applications/:id/notifications/:deliveryId/retry")
  async retryNotification(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingNotificationIdParamSchema, request.params);
    this.parse(RetryTenantOnboardingNotificationSchema, request.body);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.retryNotification(
        authContext,
        params.id,
        params.deliveryId,
      ),
    );
  }

  @Post("/platform/tenant-onboarding/applications/:id/start-review")
  async startReview(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    const body = this.parse(StartReviewTenantOnboardingApplicationSchema, request.body);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.startReview(authContext, params.id, body),
    );
  }

  @Post("/platform/tenant-onboarding/applications/:id/request-partner-assist")
  async requestPartnerAssist(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    const body = this.parse(RequestTenantOnboardingPartnerAssistSchema, request.body);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.requestPartnerAssist(
        authContext,
        params.id,
        body,
      ),
    );
  }

  @Post("/platform/tenant-onboarding/applications/:id/request-supplement")
  async requestSupplement(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    const body = this.parse(RequestSupplementTenantOnboardingApplicationSchema, request.body);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.requestSupplement(
        authContext,
        params.id,
        body,
      ),
    );
  }

  @Post("/platform/tenant-onboarding/applications/:id/approve")
  async approve(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    const body = this.parse(ApproveTenantOnboardingApplicationSchema, request.body);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.approve(authContext, params.id, body),
    );
  }

  @Post("/platform/tenant-onboarding/applications/:id/reject")
  async reject(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantOnboardingApplicationIdParamSchema, request.params);
    const body = this.parse(RejectTenantOnboardingApplicationSchema, request.body);
    return ResponseHandler.success(
      await tenantOnboardingReviewService.reject(authContext, params.id, body),
    );
  }

  @Get("/platform/service-provider-publications")
  async listServiceProviderPublications(request: FastifyRequest) {
    const context = await this.getRequiredPlatformAdminContext(request);
    const query = this.parse(TenantServiceProviderPublicationListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantServiceProvidersService.listPlatformQueue(context, query),
    );
  }

  @Get("/platform/service-provider-publications/:tenantId")
  async getServiceProviderPublication(request: FastifyRequest) {
    const context = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantServiceProviderPublicationParamSchema, request.params);
    return ResponseHandler.success(
      await tenantServiceProvidersService.getPlatformDetail(context, params.tenantId),
    );
  }

  @Get("/platform/service-provider-publications/:tenantId/areas")
  async listServiceProviderPublicationAreas(request: FastifyRequest) {
    const context = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantServiceProviderPublicationParamSchema, request.params);
    const query = this.parse(TenantServiceProviderAreaListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantServiceProvidersService.listPlatformAreas(
        context,
        params.tenantId,
        query,
      ),
    );
  }

  @Post("/platform/service-provider-publications/:tenantId/publish")
  async publishServiceProvider(request: FastifyRequest) {
    const context = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantServiceProviderPublicationParamSchema, request.params);
    const body = this.parse(PublishTenantServiceProviderProfileSchema, request.body);
    return ResponseHandler.success(
      await tenantServiceProvidersService.publish(context, params.tenantId, body),
    );
  }

  @Post("/platform/service-provider-publications/:tenantId/return-draft")
  async returnServiceProviderToDraft(request: FastifyRequest) {
    const context = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantServiceProviderPublicationParamSchema, request.params);
    const body = this.parse(ReturnTenantServiceProviderProfileToDraftSchema, request.body);
    return ResponseHandler.success(
      await tenantServiceProvidersService.returnToDraft(context, params.tenantId, body),
    );
  }

  @Post("/platform/service-provider-publications/:tenantId/suspend")
  async suspendServiceProvider(request: FastifyRequest) {
    const context = await this.getRequiredPlatformAdminContext(request);
    const params = this.parse(TenantServiceProviderPublicationParamSchema, request.params);
    const body = this.parse(SuspendTenantServiceProviderProfileSchema, request.body);
    return ResponseHandler.success(
      await tenantServiceProvidersService.suspend(context, params.tenantId, body),
    );
  }

  private parse<Schema extends z.ZodTypeAny>(
    schema: Schema,
    input: unknown,
  ): z.infer<Schema> {
    const result = schema.safeParse(input || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}

export default new PlatformTenantOnboardingController();
