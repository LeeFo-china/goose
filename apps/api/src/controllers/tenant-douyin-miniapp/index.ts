import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  tenantDouyinMiniappWorkspaceService,
  type TenantDouyinMiniappWorkspaceService,
} from "@/services/tenant-douyin-miniapp/workspace";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

type WorkspaceServicePort = Pick<
  TenantDouyinMiniappWorkspaceService,
  "getWorkspace"
>;

export class TenantDouyinMiniappController extends TenantBaseController {
  constructor(
    private readonly workspace: WorkspaceServicePort =
      tenantDouyinMiniappWorkspaceService,
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
}

export default new TenantDouyinMiniappController();
