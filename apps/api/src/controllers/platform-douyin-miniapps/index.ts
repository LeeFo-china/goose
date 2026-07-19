import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  BindPlatformDouyinMiniappSchema,
  CreateTemplateDevelopmentInstallationSchema,
  PlatformDouyinMiniappIdParamsSchema,
  PlatformDouyinMiniappListQuerySchema,
  UpdatePlatformDouyinMiniappConfigSchema,
} from "@/schema/platform-douyin-miniapps";
import {
  PlatformDouyinMiniappsService,
  platformDouyinMiniappsService,
} from "@/services/platform-douyin-miniapps";
import type { AuthContext } from "@/services/authorization";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

type ControllerService = Pick<
  PlatformDouyinMiniappsService,
  | "list"
  | "get"
  | "bind"
  | "createTemplateDevelopment"
  | "updateConfig"
  | "rotateDeploymentKey"
  | "disable"
  | "enable"
>;

export class PlatformDouyinMiniappsController extends PlatformBaseController {
  constructor(
    private readonly service: ControllerService = platformDouyinMiniappsService,
  ) {
    super("platform-douyin-miniapps");
  }

  @Get("/platform/douyin-miniapps")
  async listInstallations(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PlatformDouyinMiniappListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const data = await this.service.list(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/douyin-miniapps/:id")
  async getInstallation(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const installationId = this.parseInstallationId(request);
    const data = await this.service.get(authContext, installationId);
    return ResponseHandler.success(data);
  }

  @Post("/platform/douyin-miniapps/:id/bind")
  async bindInstallation(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const installationId = this.parseInstallationId(request);
    const bodyResult = BindPlatformDouyinMiniappSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await this.service.bind(authContext, installationId, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/platform/douyin-miniapps/template-development")
  async createTemplateDevelopment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = CreateTemplateDevelopmentInstallationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await this.service.createTemplateDevelopment(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/douyin-miniapps/:id/config")
  async updateConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const installationId = this.parseInstallationId(request);
    const bodyResult = UpdatePlatformDouyinMiniappConfigSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await this.service.updateConfig(authContext, installationId, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/platform/douyin-miniapps/:id/rotate-deployment-key")
  async rotateDeploymentKey(request: FastifyRequest, reply: FastifyReply) {
    return this.runIdAction(request, (authContext, installationId) =>
      this.service.rotateDeploymentKey(authContext, installationId));
  }

  @Post("/platform/douyin-miniapps/:id/disable")
  async disableInstallation(request: FastifyRequest, reply: FastifyReply) {
    return this.runIdAction(request, (authContext, installationId) =>
      this.service.disable(authContext, installationId));
  }

  @Post("/platform/douyin-miniapps/:id/enable")
  async enableInstallation(request: FastifyRequest, reply: FastifyReply) {
    return this.runIdAction(request, (authContext, installationId) =>
      this.service.enable(authContext, installationId));
  }

  private async runIdAction(
    request: FastifyRequest,
    action: (
      authContext: AuthContext & { isPlatformAdmin: true },
      installationId: string,
    ) => Promise<unknown>,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const installationId = this.parseInstallationId(request);
    return ResponseHandler.success(await action(authContext, installationId));
  }

  private parseInstallationId(request: FastifyRequest): string {
    const result = PlatformDouyinMiniappIdParamsSchema.safeParse(request.params || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data.id;
  }
}

export default new PlatformDouyinMiniappsController();
