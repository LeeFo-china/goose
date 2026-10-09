import type { FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { TenantActivityViewSchema } from "@/schema/tenant-activity";
import { tenantActivityCollectionService } from "@/services/tenant-activity-collection";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class TenantActivityController extends BaseController {
  constructor() { super("tenant_activity"); }

  @Post("/tenant-activity/view", { tenantServiceAccess: "read" })
  async view(request: FastifyRequest) {
    const result = TenantActivityViewSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);
    return ResponseHandler.success(await tenantActivityCollectionService.recordView(request.user, result.data));
  }
}
export default new TenantActivityController();
