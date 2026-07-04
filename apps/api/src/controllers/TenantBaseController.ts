import { BaseController } from "@/controllers/BaseController";
import { accessPolicyService } from "@/services/access-policy";
import {
  authorizationService,
  type AuthContext,
  type GetRequiredAuthContextOptions,
} from "@/services/authorization";
import type { FastifyRequest } from "fastify";
import type { ZodTypeAny } from "zod";

type TenantAuthContext = AuthContext & { tenantId: string };

export abstract class TenantBaseController<
  TCreate extends ZodTypeAny = ZodTypeAny,
  TUpdate extends ZodTypeAny = ZodTypeAny,
  T = unknown,
> extends BaseController<TCreate, TUpdate, T> {
  protected async getRequiredAuthContext(
    request: FastifyRequest,
    options: GetRequiredAuthContextOptions = {},
  ) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      options,
    );
    request.authContext = authContext;
    return authContext;
  }

  protected assertTenantContext(
    authContext: AuthContext,
  ): asserts authContext is TenantAuthContext {
    accessPolicyService.assertTenantContext(authContext);
  }

  protected async getRequiredTenantContext(
    request: FastifyRequest,
    options: GetRequiredAuthContextOptions = {},
  ): Promise<TenantAuthContext> {
    const authContext = await this.getRequiredAuthContext(request, options);
    this.assertTenantContext(authContext);
    return authContext;
  }

  protected assertPermission(authContext: AuthContext, permissionCode: string) {
    return accessPolicyService.assertPermission(authContext, permissionCode);
  }
}
