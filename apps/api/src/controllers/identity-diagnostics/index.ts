import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { IdentityDiagnosticsQuerySchema } from "@/schema/identity-diagnostics";
import { authorizationService } from "@/services/authorization";
import { identityDiagnosticsService } from "@/services/identity-diagnostics";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class IdentityDiagnosticsController extends BaseController {
  constructor() {
    super("identity_diagnostics");
  }

  @Get("/platform/identity-diagnostics")
  async inspect(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const queryResult = IdentityDiagnosticsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await identityDiagnosticsService.inspect(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }
}

export default new IdentityDiagnosticsController();
