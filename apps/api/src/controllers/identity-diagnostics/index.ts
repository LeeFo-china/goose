import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import { IdentityDiagnosticsQuerySchema } from "@/schema/identity-diagnostics";
import { identityDiagnosticsService } from "@/services/identity-diagnostics";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class IdentityDiagnosticsController extends PlatformBaseController {
  constructor() {
    super("identity_diagnostics");
  }

  @Get("/platform/identity-diagnostics")
  async inspect(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.identity_diagnostic.read",
    );

    const queryResult = IdentityDiagnosticsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await identityDiagnosticsService.inspect(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }
}

export default new IdentityDiagnosticsController();
