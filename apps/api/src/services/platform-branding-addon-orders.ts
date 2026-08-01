import type {
  PlatformBrandingAddonOrderListQuery,
} from "@/schema/branding-addon";
import type { AuthContext } from "@/services/authorization";
import {
  brandingEntitlementOrderQueryService,
} from "@/services/branding-entitlement-order-query";

type OrderQueryServicePort = {
  listPlatform(
    authContext: AuthContext,
    query: PlatformBrandingAddonOrderListQuery,
  ): Promise<unknown>;
  getPlatform(authContext: AuthContext, orderId: string): Promise<unknown>;
};

export type PlatformBrandingAddonOrdersServiceDependencies = {
  queryService?: OrderQueryServicePort;
};

export class PlatformBrandingAddonOrdersService {
  private readonly queryService: OrderQueryServicePort;

  constructor(
    dependencies: PlatformBrandingAddonOrdersServiceDependencies = {},
  ) {
    this.queryService = dependencies.queryService ??
      brandingEntitlementOrderQueryService;
  }

  async list(
    authContext: AuthContext,
    query: PlatformBrandingAddonOrderListQuery,
  ) {
    return this.queryService.listPlatform(authContext, query);
  }

  async get(authContext: AuthContext, orderId: string) {
    return this.queryService.getPlatform(authContext, orderId);
  }
}

export const platformBrandingAddonOrdersService =
  new PlatformBrandingAddonOrdersService();
