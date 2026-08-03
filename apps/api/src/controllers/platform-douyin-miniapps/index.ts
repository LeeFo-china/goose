import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  BindPlatformDouyinMiniappSchema,
  CreateTemplateDevelopmentInstallationSchema,
  PlatformDouyinMiniappIdParamsSchema,
  PlatformDouyinMiniappListQuerySchema,
  PlatformDouyinMiniappReleaseEmptyObjectSchema,
  PlatformDouyinMiniappReleaseListQuerySchema,
  PlatformDouyinMiniappReleaseParamsSchema,
  SubmitPlatformDouyinMiniappReleaseAuditSchema,
  UpdatePlatformDouyinMiniappConfigSchema,
  UploadPlatformDouyinMiniappReleaseSchema,
} from "@/schema/platform-douyin-miniapps";
import { getPlatformDouyinMiniappReleasesService } from
  "@/services/platform-douyin-miniapp-releases";
import type { PlatformDouyinMiniappReleasesService } from
  "@/services/platform-douyin-miniapp-releases";
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

type ReleaseControllerService = Pick<
  PlatformDouyinMiniappReleasesService,
  "list" | "upload" | "getTestQr" | "submitAudit" | "syncStatus" | "publish"
>;

type ReleaseServiceProvider = () => Promise<ReleaseControllerService>;

export class PlatformDouyinMiniappsController extends PlatformBaseController {
  constructor(
    private readonly service: ControllerService = platformDouyinMiniappsService,
    private readonly releaseServiceProvider: ReleaseServiceProvider =
      getPlatformDouyinMiniappReleasesService,
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

  @Get("/platform/douyin-miniapps/:id/releases")
  async listReleases(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const installationId = this.parseInstallationId(request);
    const queryResult = PlatformDouyinMiniappReleaseListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const releaseService = await this.releaseServiceProvider();
    const data = await releaseService.list(authContext, installationId, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/platform/douyin-miniapps/:id/releases/upload")
  async uploadRelease(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const installationId = this.parseInstallationId(request);
    this.parseEmptyRequestPart(request.query);
    const bodyResult = UploadPlatformDouyinMiniappReleaseSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const releaseService = await this.releaseServiceProvider();
    const data = await releaseService.upload(authContext, installationId, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/platform/douyin-miniapps/:id/releases/:releaseId/test-qr")
  async getReleaseTestQr(request: FastifyRequest, reply: FastifyReply) {
    return this.runReleaseAction(request, (service, authContext, installationId, releaseId) =>
      service.getTestQr(authContext, installationId, releaseId));
  }

  @Post("/platform/douyin-miniapps/:id/releases/:releaseId/submit-audit")
  async submitReleaseAudit(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const { id, releaseId } = this.parseReleaseIds(request);
    this.parseEmptyRequestPart(request.query);
    const bodyResult = SubmitPlatformDouyinMiniappReleaseAuditSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const releaseService = await this.releaseServiceProvider();
    const data = await releaseService.submitAudit(
      authContext,
      id,
      releaseId,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/douyin-miniapps/:id/releases/:releaseId/sync-status")
  async syncReleaseStatus(request: FastifyRequest, reply: FastifyReply) {
    return this.runReleaseAction(request, (service, authContext, installationId, releaseId) =>
      service.syncStatus(authContext, installationId, releaseId));
  }

  @Post("/platform/douyin-miniapps/:id/releases/:releaseId/publish")
  async publishRelease(request: FastifyRequest, reply: FastifyReply) {
    return this.runReleaseAction(request, (service, authContext, installationId, releaseId) =>
      service.publish(authContext, installationId, releaseId));
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

  private async runReleaseAction(
    request: FastifyRequest,
    action: (
      service: ReleaseControllerService,
      authContext: AuthContext & { isPlatformAdmin: true },
      installationId: string,
      releaseId: string,
    ) => Promise<unknown>,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const { id, releaseId } = this.parseReleaseIds(request);
    this.parseEmptyRequestPart(request.query);
    this.parseEmptyRequestPart(request.body);
    const releaseService = await this.releaseServiceProvider();
    return ResponseHandler.success(
      await action(releaseService, authContext, id, releaseId),
    );
  }

  private parseInstallationId(request: FastifyRequest): string {
    const result = PlatformDouyinMiniappIdParamsSchema.safeParse(request.params || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data.id;
  }

  private parseReleaseIds(request: FastifyRequest) {
    const result = PlatformDouyinMiniappReleaseParamsSchema.safeParse(request.params || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }

  private parseEmptyRequestPart(input: unknown): void {
    const result = PlatformDouyinMiniappReleaseEmptyObjectSchema.safeParse(
      input === undefined ? {} : input,
    );
    if (!result.success) throw Errors.fromZod(result.error);
  }
}

export default new PlatformDouyinMiniappsController();
