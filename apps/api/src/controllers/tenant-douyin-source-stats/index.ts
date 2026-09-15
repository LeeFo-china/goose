import type { FastifyRequest } from "fastify";

import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { TenantDouyinSourceStatsQuerySchema } from
  "@/schema/tenant-douyin-source-stats";
import { tenantDouyinSourceStatsService, type TenantDouyinSourceStatsService } from
  "@/services/tenant-douyin-source-stats";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

export class TenantDouyinSourceStatsController extends TenantBaseController {
  constructor(private readonly service: Pick<TenantDouyinSourceStatsService,
    "getStats"> = tenantDouyinSourceStatsService) {
    super("tenant-douyin-source-stats");
  }

  @Get("/tenant/douyin-miniapp/source-stats")
  async getStats(request: FastifyRequest) {
    const parsed = TenantDouyinSourceStatsQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.getStats(auth, parsed.data));
  }
}

export default new TenantDouyinSourceStatsController();
