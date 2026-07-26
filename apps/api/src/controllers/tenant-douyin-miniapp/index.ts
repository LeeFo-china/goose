import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantDouyinAuthorizationCallbackSchema,
  TenantDouyinAuthorizationLinkSchema,
} from "@/schema/tenant-douyin-miniapp";
import {
  getTenantDouyinMiniappAuthorizationService,
  type TenantDouyinMiniappAuthorizationService,
} from "@/services/tenant-douyin-miniapp/authorization";
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

export class TenantDouyinMiniappController extends TenantBaseController {
  constructor(
    private readonly workspace: WorkspaceServicePort =
      tenantDouyinMiniappWorkspaceService,
    private readonly authorizationProvider: AuthorizationServiceProvider =
      getTenantDouyinMiniappAuthorizationService,
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
}

export default new TenantDouyinMiniappController();
