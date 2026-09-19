import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformAdminApplicationIdParamSchema,
  PlatformAdminIdempotencyHeadersSchema,
  PlatformAdminPartnerApproveSchema,
  PlatformAdminPartnerRejectSchema,
  PlatformAdminPartnerRequestSupplementSchema,
  PlatformAdminReviewListQuerySchema,
  PlatformAdminReviewLogListQuerySchema,
  PlatformAdminTenantApproveSchema,
  PlatformAdminTenantRejectSchema,
  PlatformAdminTenantRequestSupplementSchema,
} from "@/schema/platform-admin-review-workbench";
import { platformAdminReviewWorkbenchService } from "@/services/platform-admin-review-workbench";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class PlatformAdminReviewWorkbenchController extends PlatformBaseController {
  constructor() {
    super("platform_admin_review_workbench");
  }

  @Get("/platform/admin/review-workbench/summary")
  async summary(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    return ResponseHandler.success(await platformAdminReviewWorkbenchService.summary(auth));
  }

  @Get("/platform/admin/tenant-onboarding/applications")
  async listTenantApplications(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const query = this.parse(PlatformAdminReviewListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.listTenantApplications(auth, query),
    );
  }

  @Get("/platform/admin/tenant-onboarding/applications/:id")
  async getTenantApplication(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.getTenantApplication(auth, id),
    );
  }

  @Get("/platform/admin/tenant-onboarding/applications/:id/business-license/preview-url")
  async getTenantLicensePreview(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.getTenantLicensePreview(auth, id),
    );
  }

  @Post("/platform/admin/tenant-onboarding/applications/:id/approve")
  async approveTenantApplication(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    this.idempotencyKey(request);
    const body = this.parse(PlatformAdminTenantApproveSchema, request.body);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.approveTenantApplication(auth, id, body),
    );
  }

  @Post("/platform/admin/tenant-onboarding/applications/:id/reject")
  async rejectTenantApplication(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    this.idempotencyKey(request);
    const body = this.parse(PlatformAdminTenantRejectSchema, request.body);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.rejectTenantApplication(auth, id, body),
    );
  }

  @Post("/platform/admin/tenant-onboarding/applications/:id/request-supplement")
  async requestTenantSupplement(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    this.idempotencyKey(request);
    const body = this.parse(PlatformAdminTenantRequestSupplementSchema, request.body);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.requestTenantSupplement(auth, id, body),
    );
  }

  @Get("/platform/admin/partner-applications")
  async listPartnerApplications(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const query = this.parse(PlatformAdminReviewListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.listPartnerApplications(auth, query),
    );
  }

  @Get("/platform/admin/partner-applications/:id")
  async getPartnerApplication(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.getPartnerApplication(auth, id),
    );
  }

  @Post("/platform/admin/partner-applications/:id/approve")
  async approvePartnerApplication(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    const key = this.idempotencyKey(request);
    const body = this.parse(PlatformAdminPartnerApproveSchema, request.body);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.approvePartnerApplication(auth, id, body, key),
    );
  }

  @Post("/platform/admin/partner-applications/:id/reject")
  async rejectPartnerApplication(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    const key = this.idempotencyKey(request);
    const body = this.parse(PlatformAdminPartnerRejectSchema, request.body);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.rejectPartnerApplication(auth, id, body, key),
    );
  }

  @Post("/platform/admin/partner-applications/:id/request-supplement")
  async requestPartnerSupplement(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const { id } = this.parse(PlatformAdminApplicationIdParamSchema, request.params);
    const key = this.idempotencyKey(request);
    const body = this.parse(PlatformAdminPartnerRequestSupplementSchema, request.body);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.requestPartnerSupplement(auth, id, body, key),
    );
  }

  @Get("/platform/admin/review-logs")
  async listReviewLogs(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const query = this.parse(PlatformAdminReviewLogListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformAdminReviewWorkbenchService.listReviewLogs(auth, query),
    );
  }

  private parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
    const result = schema.safeParse(input ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      throw Errors.business(
        422,
        issue?.message ?? "请求参数校验失败",
        "VALIDATION_ERROR",
        result.error.issues,
      );
    }
    return result.data;
  }

  private idempotencyKey(request: FastifyRequest) {
    const raw = request.headers["idempotency-key"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return this.parse(PlatformAdminIdempotencyHeadersSchema, {
      "idempotency-key": value,
    })["idempotency-key"];
  }
}

export default new PlatformAdminReviewWorkbenchController();
