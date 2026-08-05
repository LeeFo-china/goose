import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import { AdministrativeAreaListQuerySchema } from "@/schema/administrative-areas";
import { administrativeAreaService } from "@/services/administrative-areas";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class AdministrativeAreasController extends PlatformBaseController {
  constructor() {
    super("administrative_areas");
  }

  @Get("/platform/administrative-areas")
  async listAdministrativeAreas(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.location.manage",
    );
    const queryResult = AdministrativeAreaListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await administrativeAreaService.list(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/public/administrative-areas")
  async listPublicAdministrativeAreas(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = AdministrativeAreaListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await administrativeAreaService.listPublic(queryResult.data);
    reply.header("Cache-Control", `public, max-age=${data.expires_in}`);
    return ResponseHandler.success(data);
  }
}

export default new AdministrativeAreasController();
