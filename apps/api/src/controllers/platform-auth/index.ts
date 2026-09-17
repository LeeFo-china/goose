import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import {
  platformAuthService,
  type PlatformAuthService,
} from "@/services/platform-auth";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

export class PlatformAuthController extends PlatformBaseController {
  constructor(
    private readonly service: Pick<PlatformAuthService, "unbindWechat"> =
      platformAuthService,
  ) {
    super("platform_auth");
  }

  @Post("/platform/auth/unbind-wechat")
  async unbindWechat(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSuperAdminContext(request);
    const data = await this.service.unbindWechat({
      authUserId: authContext.authUserId,
      employeeId: authContext.employeeId,
      openid: request.user?.openid,
    });
    return ResponseHandler.success(data);
  }
}

export default new PlatformAuthController();
