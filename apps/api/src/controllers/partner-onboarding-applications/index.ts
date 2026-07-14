import type { FastifyRequest } from "fastify";
import type { z } from "zod";

import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantOnboardingApplicationIdParamSchema,
  TenantOnboardingPartnerAssistDecisionSchema,
  TenantOnboardingPartnerAssistListQuerySchema,
} from "@/schema/tenant-onboarding";
import { tenantOnboardingPartnerAssistService } from "@/services/tenant-onboarding-partner-assist";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class PartnerOnboardingApplicationsController extends BaseController {
  constructor() {
    super("partner-onboarding-applications");
  }

  @Get("/partner/onboarding-applications")
  async listApplications(request: FastifyRequest) {
    const query = this.parse(
      TenantOnboardingPartnerAssistListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await tenantOnboardingPartnerAssistService.list(request.user, query),
    );
  }

  @Get("/partner/onboarding-applications/:id")
  async get(request: FastifyRequest) {
    const params = this.parse(
      TenantOnboardingApplicationIdParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await tenantOnboardingPartnerAssistService.get(request.user, params.id),
    );
  }

  @Post("/partner/onboarding-applications/:id/assist-review")
  async review(request: FastifyRequest) {
    const params = this.parse(
      TenantOnboardingApplicationIdParamSchema,
      request.params,
    );
    const body = this.parse(
      TenantOnboardingPartnerAssistDecisionSchema,
      request.body,
    );
    return ResponseHandler.success(
      await tenantOnboardingPartnerAssistService.review(
        request.user,
        params.id,
        body,
      ),
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

export default new PartnerOnboardingApplicationsController();
