import { Errors } from "@/errors/error-factory";
import type {
  PlatformBrandingAddonOrderListQuery,
} from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  brandingEntitlementOrderQueryService,
} from "@/services/branding-entitlement-order-query";

const READ_PERMISSION = "platform.branding_order.read";

type OrderQueryServicePort = {
  listPlatform(
    authContext: AuthContext,
    query: PlatformBrandingAddonOrderListQuery,
  ): Promise<unknown>;
  getPlatform(authContext: AuthContext, orderId: string): Promise<unknown>;
};
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;

export type PlatformBrandingAddonOrdersServiceDependencies = {
  queryService?: OrderQueryServicePort;
  accessPolicy?: AccessPolicyPort;
};

export class PlatformBrandingAddonOrdersService {
  private readonly queryService: OrderQueryServicePort;
  private readonly accessPolicy: AccessPolicyPort;

  constructor(
    dependencies: PlatformBrandingAddonOrdersServiceDependencies = {},
  ) {
    this.queryService = dependencies.queryService ??
      brandingEntitlementOrderQueryService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
  }

  async list(
    authContext: AuthContext,
    query: PlatformBrandingAddonOrderListQuery,
  ) {
    this.requirePlatformReader(authContext);
    return this.queryService.listPlatform(authContext, query);
  }

  async get(authContext: AuthContext, orderId: string) {
    this.requirePlatformReader(authContext);
    return this.queryService.getPlatform(authContext, orderId);
  }

  private requirePlatformReader(authContext: AuthContext): void {
    if (
      !authContext.isPlatformAdmin ||
      authContext.tenantId !== null ||
      !authContext.employeeId ||
      authContext.employeeStatus !== "active" ||
      !authContext.authUserId
    ) throw Errors.forbidden();
    this.accessPolicy.assertPermission(authContext, READ_PERMISSION);
  }
}

export const platformBrandingAddonOrdersService =
  new PlatformBrandingAddonOrdersService();
