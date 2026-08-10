import { BaseController } from "@/controllers/BaseController";
import { platformAuthorizationService, type PlatformStaffAuthContext } from "@/services/platform-authorization";
import { authorizationService, type AuthContext } from "@/services/authorization";
import type { PermissionCode } from "@gooes/domain";
import type { FastifyRequest } from "fastify";
import type { ZodTypeAny } from "zod";

type PlatformAuthContext = PlatformStaffAuthContext & { isPlatformAdmin: true; isPlatformSuperAdmin: true };

export abstract class PlatformBaseController<
  TCreate extends ZodTypeAny = ZodTypeAny,
  TUpdate extends ZodTypeAny = ZodTypeAny,
  T = unknown,
> extends BaseController<TCreate, TUpdate, T> {
  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  protected assertPlatformAdmin(
    authContext: AuthContext,
  ): asserts authContext is PlatformAuthContext {
    platformAuthorizationService.assertSuperAdmin(authContext as PlatformStaffAuthContext);
  }

  protected async getRequiredPlatformStaffContext(
    request: FastifyRequest,
  ): Promise<PlatformStaffAuthContext> {
    const authContext = await this.getRequiredAuthContext(request);
    const platformContext = await platformAuthorizationService.assertPlatformSession(
      authContext,
      request.user?.admin_auth_version,
    );
    request.authContext = platformContext;
    return platformContext;
  }

  protected async getRequiredPlatformPermissionContext(
    request: FastifyRequest,
    permissionCode: PermissionCode,
  ): Promise<PlatformStaffAuthContext> {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    platformAuthorizationService.assertPermission(authContext, permissionCode);
    return authContext;
  }

  protected async getRequiredPlatformSuperAdminContext(
    request: FastifyRequest,
  ): Promise<PlatformAuthContext> {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    platformAuthorizationService.assertSuperAdmin(authContext);
    return {
      ...authContext,
      isPlatformAdmin: true,
      isPlatformSuperAdmin: true,
    };
  }

  protected async getRequiredPlatformAdminContext(
    request: FastifyRequest,
  ): Promise<PlatformAuthContext> {
    return this.getRequiredPlatformSuperAdminContext(request);
  }
}
