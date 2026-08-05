import { BaseController } from "@/controllers/BaseController";
import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  BrandingDraftSchema,
  BrandingEmptyQuerySchema,
  BrandingEntitlementListQuerySchema,
  BrandingPublishSchema,
  BrandingTenantParamsSchema,
  EntitlementGrantSchema,
  EntitlementResumeSchema,
  EntitlementRevokeSchema,
  EntitlementSuspendSchema,
} from "@/schema/branding";
import { brandProfilesService } from "@/services/brand-profiles";
import { effectiveBrandingService } from "@/services/effective-branding";
import { tenantEntitlementsService } from "@/services/tenant-entitlements";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

function withEffective<T extends object>(
  value: T,
  effective: Awaited<ReturnType<typeof effectiveBrandingService.resolvePlatform>>,
) {
  return { ...value, effective };
}

class EffectiveBrandingController extends BaseController {
  constructor() {
    super("effective-branding");
  }

  @Get("/branding/effective")
  async getEffective(request: FastifyRequest, reply: FastifyReply) {
    parse(BrandingEmptyQuerySchema, request.query);
    const effective = await effectiveBrandingService.resolveForRequest(
      request.user,
    );
    reply.header("Cache-Control", "private, no-store");
    return ResponseHandler.success(effective);
  }
}

class PlatformBrandingController extends PlatformBaseController {
  constructor() {
    super("platform-branding");
  }

  @Get("/platform/branding")
  async getPlatform(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.branding.manage",
    );
    parse(BrandingEmptyQuerySchema, request.query);
    const result = await brandProfilesService.getPlatform(authContext);
    const effective = await effectiveBrandingService.resolvePlatform();
    return ResponseHandler.success(withEffective(result, effective));
  }

  @Patch("/platform/branding")
  async savePlatformDraft(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.branding.manage",
    );
    parse(BrandingEmptyQuerySchema, request.query);
    const input = parse(BrandingDraftSchema, request.body);
    const result = await brandProfilesService.savePlatformDraft(
      authContext,
      input,
    );
    const effective = await effectiveBrandingService.resolvePlatform();
    return ResponseHandler.success(withEffective(result, effective));
  }

  @Post("/platform/branding/publish")
  async publishPlatform(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.branding.manage",
    );
    parse(BrandingEmptyQuerySchema, request.query);
    const input = parse(BrandingPublishSchema, request.body);
    const result = await brandProfilesService.publishPlatform(
      authContext,
      input,
    );
    const effective = await effectiveBrandingService.resolvePlatform();
    return ResponseHandler.success(withEffective(result, effective));
  }

  @Get("/platform/tenants/:id/entitlements")
  async listEntitlements(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.branding.manage",
    );
    const { id } = parse(BrandingTenantParamsSchema, request.params);
    const query = parse(
      BrandingEntitlementListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await tenantEntitlementsService.listPlatform(authContext, id, query),
    );
  }

  @Post(
    "/platform/tenants/:id/entitlements/custom_support_branding/grant",
  )
  async grantEntitlement(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.branding.manage",
    );
    const { id } = parse(BrandingTenantParamsSchema, request.params);
    parse(BrandingEmptyQuerySchema, request.query);
    const input = parse(EntitlementGrantSchema, request.body);
    return ResponseHandler.success(
      await tenantEntitlementsService.grant(authContext, id, input),
    );
  }

  @Post(
    "/platform/tenants/:id/entitlements/custom_support_branding/suspend",
  )
  async suspendEntitlement(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.branding.manage",
    );
    const { id } = parse(BrandingTenantParamsSchema, request.params);
    parse(BrandingEmptyQuerySchema, request.query);
    const input = parse(EntitlementSuspendSchema, request.body);
    return ResponseHandler.success(
      await tenantEntitlementsService.suspend(authContext, id, input),
    );
  }

  @Post(
    "/platform/tenants/:id/entitlements/custom_support_branding/resume",
  )
  async resumeEntitlement(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.branding.manage",
    );
    const { id } = parse(BrandingTenantParamsSchema, request.params);
    parse(BrandingEmptyQuerySchema, request.query);
    const input = parse(EntitlementResumeSchema, request.body);
    return ResponseHandler.success(
      await tenantEntitlementsService.resume(authContext, id, input),
    );
  }

  @Post(
    "/platform/tenants/:id/entitlements/custom_support_branding/revoke",
  )
  async revokeEntitlement(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.branding.manage",
    );
    const { id } = parse(BrandingTenantParamsSchema, request.params);
    parse(BrandingEmptyQuerySchema, request.query);
    const input = parse(EntitlementRevokeSchema, request.body);
    return ResponseHandler.success(
      await tenantEntitlementsService.revoke(authContext, id, input),
    );
  }
}

class TenantBrandingController extends TenantBaseController {
  constructor() {
    super("tenant-branding");
  }

  @Get("/tenant/branding")
  async getTenant(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    parse(BrandingEmptyQuerySchema, request.query);
    const result = await brandProfilesService.getTenant(authContext);
    const effective = await effectiveBrandingService.resolveForTenant(
      authContext.tenantId,
    );
    return ResponseHandler.success(withEffective(result, effective));
  }

  @Patch("/tenant/branding")
  async saveTenantDraft(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    parse(BrandingEmptyQuerySchema, request.query);
    const input = parse(BrandingDraftSchema, request.body);
    const result = await brandProfilesService.saveTenantDraft(
      authContext,
      input,
    );
    const effective = await effectiveBrandingService.resolveForTenant(
      authContext.tenantId,
    );
    return ResponseHandler.success(withEffective(result, effective));
  }

  @Post("/tenant/branding/publish")
  async publishTenant(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    parse(BrandingEmptyQuerySchema, request.query);
    const input = parse(BrandingPublishSchema, request.body);
    const result = await brandProfilesService.publishTenant(authContext, input);
    const effective = await effectiveBrandingService.resolveForTenant(
      authContext.tenantId,
    );
    return ResponseHandler.success(withEffective(result, effective));
  }
}

class BrandingController {
  private readonly controllers = [
    new EffectiveBrandingController(),
    new PlatformBrandingController(),
    new TenantBrandingController(),
  ] as const;

  registerExtraRoutes(app: FastifyInstance): void {
    for (const controller of this.controllers) {
      controller.registerExtraRoutes(app);
    }
  }
}

export default new BrandingController();
