import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateTenantServiceProviderAreaSchema,
  SubmitTenantServiceProviderProfileSchema,
  TenantServiceProviderAreaIdParamSchema,
  TenantServiceProviderAreaListQuerySchema,
  UpdateTenantServiceProviderAreaSchema,
  UpdateTenantServiceProviderProfileSchema,
} from "@/schema/tenant-onboarding";
import { tenantServiceProvidersService } from "@/services/tenant-service-providers";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class TenantServiceProviderController extends TenantBaseController {
  constructor() {
    super("tenant_service_provider_profiles");
  }

  @Get("/tenant/service-provider-profile")
  async getProfile(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await tenantServiceProvidersService.getTenantProfile(context),
    );
  }

  @Patch("/tenant/service-provider-profile")
  async updateProfile(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    const body = parse(UpdateTenantServiceProviderProfileSchema, request.body);
    return ResponseHandler.success(
      await tenantServiceProvidersService.updateTenantProfile(context, body),
    );
  }

  @Get("/tenant/service-provider-areas")
  async listAreas(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    const query = parse(TenantServiceProviderAreaListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantServiceProvidersService.listTenantAreas(context, query),
    );
  }

  @Post("/tenant/service-provider-areas")
  async createArea(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    const body = parse(CreateTenantServiceProviderAreaSchema, request.body);
    return ResponseHandler.success(
      await tenantServiceProvidersService.createTenantArea(context, body),
    );
  }

  @Patch("/tenant/service-provider-areas/:id")
  async updateArea(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    const params = parse(TenantServiceProviderAreaIdParamSchema, request.params);
    const body = parse(UpdateTenantServiceProviderAreaSchema, request.body);
    return ResponseHandler.success(
      await tenantServiceProvidersService.updateTenantArea(context, params.id, body),
    );
  }

  @Post("/tenant/service-provider-profile/submit")
  async submit(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    const body = parse(SubmitTenantServiceProviderProfileSchema, request.body);
    return ResponseHandler.success(
      await tenantServiceProvidersService.submitTenantProfile(context, body),
    );
  }
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input || {});
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

export default new TenantServiceProviderController();
