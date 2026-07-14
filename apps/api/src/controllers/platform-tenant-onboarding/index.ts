import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ApproveTenantOnboardingApplicationSchema,
  RejectTenantOnboardingApplicationSchema,
  RequestSupplementTenantOnboardingApplicationSchema,
  RequestTenantOnboardingPartnerAssistSchema,
  RetryTenantOnboardingNotificationSchema,
  StartReviewTenantOnboardingApplicationSchema,
  TenantOnboardingApplicationIdParamSchema,
  TenantOnboardingApplicationListQuerySchema,
  TenantOnboardingNotificationIdParamSchema,
  TenantOnboardingNotificationListQuerySchema,
  TenantOnboardingReviewListQuerySchema,
} from "@/schema/tenant-onboarding";
import { tenantOnboardingReviewService } from "@/services/tenant-onboarding-review";
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
