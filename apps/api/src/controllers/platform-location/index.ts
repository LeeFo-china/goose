import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import { PlatformAddressSuggestionQuerySchema } from "@/schema/platform-location";
import { tencentLbsService } from "@/services/tencent-lbs";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformLocationController extends PlatformBaseController {
  constructor() {
    super("platform_location");
  }

  @Get("/platform/location/address-suggestions")
  async suggestAddresses(request: FastifyRequest, reply: FastifyReply) {
    await this.getRequiredPlatformAdminContext(request);

    const queryResult = PlatformAddressSuggestionQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await tencentLbsService.suggestAddress(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/location/map-config")
  async getMapConfig(request: FastifyRequest, reply: FastifyReply) {
    await this.getRequiredPlatformAdminContext(request);

    const data = await tencentLbsService.getWebMapConfig();
    return ResponseHandler.success(data);
  }
}

export default new PlatformLocationController();
