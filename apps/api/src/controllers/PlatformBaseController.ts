import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { authorizationService, type AuthContext } from "@/services/authorization";
import type { FastifyRequest } from "fastify";
import type { ZodTypeAny } from "zod";

type PlatformAuthContext = AuthContext & { isPlatformAdmin: true };

export abstract class PlatformBaseController<
  TCreate extends ZodTypeAny = ZodTypeAny,
  TUpdate extends ZodTypeAny = ZodTypeAny,
  T = unknown,
> extends BaseController<TCreate, TUpdate, T> {
  protected async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  protected assertPlatformAdmin(
    authContext: AuthContext,
  ): asserts authContext is PlatformAuthContext {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  protected async getRequiredPlatformAdminContext(
    request: FastifyRequest,
  ): Promise<PlatformAuthContext> {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertPlatformAdmin(authContext);
    return authContext;
  }
}
