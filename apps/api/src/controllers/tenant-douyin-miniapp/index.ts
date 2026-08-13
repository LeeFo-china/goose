import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantDouyinAuthorizationCallbackSchema,
  TenantDouyinAuthorizationLinkSchema,
  TenantDouyinReleaseEmptyObjectSchema,
  TenantDouyinReleaseListQuerySchema,
  TenantDouyinReleaseParamsSchema,
  TenantDouyinSubmitReleaseAuditSchema,
} from "@/schema/tenant-douyin-miniapp";
import {
  getTenantDouyinMiniappAuthorizationService,
  type TenantDouyinMiniappAuthorizationService,
} from "@/services/tenant-douyin-miniapp/authorization";
import {
  getTenantDouyinMiniappReleasesService,
  type TenantDouyinMiniappReleasesService,
} from "@/services/tenant-douyin-miniapp/releases";
import {
  tenantDouyinMiniappWorkspaceService,
  type TenantDouyinMiniappWorkspaceService,
} from "@/services/tenant-douyin-miniapp/workspace";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

type WorkspaceServicePort = Pick<
  TenantDouyinMiniappWorkspaceService,
  "getWorkspace"
>;
type AuthorizationServicePort = Pick<
  TenantDouyinMiniappAuthorizationService,
  "startAuthorization" | "completeAuthorizationCallback"
>;
type AuthorizationServiceProvider = () => AuthorizationServicePort;
type ReleaseServicePort = Pick<
  TenantDouyinMiniappReleasesService,
  | "list"
  | "createFromCurrentTemplate"
  | "getTestQr"
  | "submitAudit"
  | "syncStatus"
  | "publish"
>;
type ReleaseServiceProvider = () => Promise<ReleaseServicePort>;

export class TenantDouyinMiniappController extends TenantBaseController {
  constructor(
    private readonly workspace: WorkspaceServicePort =
      tenantDouyinMiniappWorkspaceService,
    private readonly authorizationProvider: AuthorizationServiceProvider =
      getTenantDouyinMiniappAuthorizationService,
    private readonly releaseProvider: ReleaseServiceProvider =
      getTenantDouyinMiniappReleasesService,
  ) {
    super("tenant-douyin-miniapp");
  }

  @Get("/tenant/douyin-miniapp/workspace")
  async getWorkspace(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.workspace.getWorkspace(authContext),
    );
  }

  @Post("/tenant/douyin-miniapp/authorization-link")
  async startAuthorization(request: FastifyRequest) {
    const bodyResult = TenantDouyinAuthorizationLinkSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.authorizationProvider().startAuthorization(authContext),
    );
  }

  @Post("/tenant/douyin-miniapp/authorization-callback")
  async completeAuthorization(request: FastifyRequest) {
    const bodyResult = TenantDouyinAuthorizationCallbackSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await this.authorizationProvider().completeAuthorizationCallback(
        authContext,
        bodyResult.data,
      ),
    );
  }

  @Get("/tenant/douyin-miniapp/releases")
  async listReleases(request: FastifyRequest) {
    const queryResult = TenantDouyinReleaseListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getRequiredTenantContext(request);
    const service = await this.releaseProvider();
    return ResponseHandler.success(
      await service.list(authContext, queryResult.data),
    );
  }

  @Post("/tenant/douyin-miniapp/releases/from-current-template")
  async createReleaseFromCurrentTemplate(request: FastifyRequest) {
    this.parseEmptyPart(request.query);
    this.parseEmptyPart(request.body);
    const authContext = await this.getRequiredTenantContext(request);
    const service = await this.releaseProvider();
    return ResponseHandler.success(
      await service.createFromCurrentTemplate(authContext),
    );
  }

  @Post("/tenant/douyin-miniapp/releases/:releaseId/test-qr")
  async getReleaseTestQr(request: FastifyRequest) {
    const { authContext, releaseId } = await this.releaseActionContext(request);
    const service = await this.releaseProvider();
    return ResponseHandler.success(
      await service.getTestQr(authContext, releaseId),
    );
  }

  @Post("/tenant/douyin-miniapp/releases/:releaseId/submit-audit")
  async submitReleaseAudit(request: FastifyRequest) {
    const paramsResult = TenantDouyinReleaseParamsSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = TenantDouyinSubmitReleaseAuditSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const authContext = await this.getRequiredTenantContext(request);
    const service = await this.releaseProvider();
    return ResponseHandler.success(
      await service.submitAudit(
        authContext,
        paramsResult.data.releaseId,
        bodyResult.data,
      ),
    );
  }

  @Post("/tenant/douyin-miniapp/releases/:releaseId/sync-status")
  async syncReleaseStatus(request: FastifyRequest) {
    const { authContext, releaseId } = await this.releaseActionContext(request);
    const service = await this.releaseProvider();
    return ResponseHandler.success(
      await service.syncStatus(authContext, releaseId),
    );
  }

  @Post("/tenant/douyin-miniapp/releases/:releaseId/publish")
  async publishRelease(request: FastifyRequest) {
    const { authContext, releaseId } = await this.releaseActionContext(request);
    const service = await this.releaseProvider();
    return ResponseHandler.success(
      await service.publish(authContext, releaseId),
    );
  }

  private async releaseActionContext(request: FastifyRequest) {
    const paramsResult = TenantDouyinReleaseParamsSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    this.parseEmptyPart(request.query);
    this.parseEmptyPart(request.body);
    const authContext = await this.getRequiredTenantContext(request);
    return { authContext, releaseId: paramsResult.data.releaseId };
  }

  private parseEmptyPart(input: unknown): void {
    const result = TenantDouyinReleaseEmptyObjectSchema.safeParse(input || {});
    if (!result.success) throw Errors.fromZod(result.error);
  }
}

export default new TenantDouyinMiniappController();
