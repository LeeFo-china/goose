import type { FastifyRequest } from "fastify";

import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantDouyinProjectImagesQuerySchema,
  TenantDouyinProjectListQuerySchema,
  TenantDouyinProjectParamsSchema,
  TenantDouyinProjectPublicationSchema,
} from "@/schema/tenant-douyin-projects";
import {
  tenantDouyinProjectsService,
  type TenantDouyinProjectsService,
} from "@/services/tenant-douyin-projects";
import { Get, Patch } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

type ServicePort = Pick<
  TenantDouyinProjectsService,
  "list" | "updatePublication" | "listAttachedImages"
>;

export class TenantDouyinProjectsController extends TenantBaseController {
  constructor(
    private readonly service: ServicePort = tenantDouyinProjectsService,
  ) {
    super("tenant-douyin-projects");
  }

  @Get("/tenant/douyin-miniapp/projects")
  async listProjects(request: FastifyRequest) {
    const queryResult = TenantDouyinProjectListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.list(authContext, queryResult.data),
    );
  }

  @Patch("/tenant/douyin-miniapp/projects/:projectId/publication")
  async updatePublication(request: FastifyRequest) {
    const paramsResult = TenantDouyinProjectParamsSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = TenantDouyinProjectPublicationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.updatePublication(
        authContext,
        paramsResult.data.projectId,
        bodyResult.data,
      ),
    );
  }

  @Get("/tenant/douyin-miniapp/projects/:projectId/images")
  async listAttachedImages(request: FastifyRequest) {
    const paramsResult = TenantDouyinProjectParamsSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = TenantDouyinProjectImagesQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.service.listAttachedImages(
        authContext,
        paramsResult.data.projectId,
        queryResult.data,
      ),
    );
  }
}

export default new TenantDouyinProjectsController();
