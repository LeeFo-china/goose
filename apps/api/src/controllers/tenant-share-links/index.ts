import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantShareLinkCreateSchema,
  TenantShareLinkListQuerySchema,
  TenantShareLinkTokenParamsSchema,
} from "@/schema/tenant-share-links";
import { authorizationService } from "@/services/authorization";
import { tenantShareLinkService } from "@/services/tenant-share-links";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class TenantShareLinksController extends BaseController {
  constructor() {
    super("tenant_share_links");
  }

  @Post("/tenant-share-links")
  async createShareLink(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const bodyResult = TenantShareLinkCreateSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await tenantShareLinkService.create(bodyResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/tenant-share-links")
  async listShareLinks(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const queryResult = TenantShareLinkListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await tenantShareLinkService.list(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/public/tenant-share-links/:token")
  async getPublicShareLink(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = TenantShareLinkTokenParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await tenantShareLinkService.getPublicDetail(paramsResult.data.token);
    return ResponseHandler.success(data);
  }
}

export default new TenantShareLinksController();
