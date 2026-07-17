import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformAddressSuggestionQuerySchema,
  TenantLocationGeocodeQuerySchema,
} from "@/schema/platform-location";
import { tencentLbsService } from "@/services/tencent-lbs";
import type { AuthContext } from "@/services/authorization";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

const SERVICE_PROVIDER_READ_PERMISSION = "service_provider.profile.read";
const SERVICE_PROVIDER_MANAGE_PERMISSION = "service_provider.profile.manage";

class TenantLocationController extends TenantBaseController {
  constructor() {
    super("tenant_location");
  }

  @Get("/tenant/location/address-suggestions")
  async suggestAddresses(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    this.assertServiceProviderProfileAccess(context);

    const queryResult = PlatformAddressSuggestionQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await tencentLbsService.suggestAddress(queryResult.data),
    );
  }

  @Get("/tenant/location/geocode")
  async geocode(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    this.assertServiceProviderProfileAccess(context);

    const queryResult = TenantLocationGeocodeQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await tencentLbsService.geocodeAddress(queryResult.data),
    );
  }

  @Get("/tenant/location/map-config")
  async getMapConfig(request: FastifyRequest) {
    const context = await this.getRequiredTenantContext(request);
    this.assertServiceProviderProfileAccess(context);

    return ResponseHandler.success(await tencentLbsService.getWebMapConfig());
  }

  private assertServiceProviderProfileAccess(authContext: AuthContext) {
    if (authContext.permissions.some((permission) =>
      permission.code === SERVICE_PROVIDER_MANAGE_PERMISSION ||
      permission.code === SERVICE_PROVIDER_READ_PERMISSION
    )) {
      return;
    }

    this.assertPermission(authContext, SERVICE_PROVIDER_MANAGE_PERMISSION);
  }
}

export default new TenantLocationController();
