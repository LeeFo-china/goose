import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { VisitorLocalServiceProviderListQuerySchema } from "@/schema/tenant-onboarding";
import { tenantServiceProvidersService } from "@/services/tenant-service-providers";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

class VisitorLocalServiceProvidersController extends BaseController {
  constructor() {
    super("tenant_service_provider_profiles");
  }

  @Get("/visitor/local-service-providers")
  async listProviders(request: FastifyRequest) {
    const result = VisitorLocalServiceProviderListQuerySchema.safeParse(
      request.query || {},
    );
    if (!result.success) throw Errors.fromZod(result.error);
    return ResponseHandler.success(
      await tenantServiceProvidersService.listVisitorProviders(
        request.user,
        result.data,
      ),
    );
  }
}

export default new VisitorLocalServiceProvidersController();
