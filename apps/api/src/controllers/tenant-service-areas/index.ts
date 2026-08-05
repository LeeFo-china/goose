import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateTenantServiceAreaSchema,
  LocationBootstrapConfirmSchema,
  LocationBootstrapSchema,
  TenantServiceAreaIdParamsSchema,
  TenantServiceAreaListQuerySchema,
  UpdateTenantServiceAreaSchema,
} from "@/schema/tenant-service-areas";
import { customerLocationService } from "@/services/customer-location";
import { locationMatchingService } from "@/services/location-matching";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class TenantServiceAreasController extends PlatformBaseController {
  constructor() {
    super("tenant_service_areas");
  }

  @Get("/platform/tenant-service-areas")
  async listServiceAreas(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.location.manage",
    );
    const queryResult = TenantServiceAreaListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await locationMatchingService.listServiceAreas(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/tenant-service-areas")
  async createServiceArea(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.location.manage",
    );
    const bodyResult = CreateTenantServiceAreaSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await locationMatchingService.createServiceArea(bodyResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/tenant-service-areas/:id")
  async updateServiceArea(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.location.manage",
    );
    const paramsResult = TenantServiceAreaIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateTenantServiceAreaSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await locationMatchingService.updateServiceArea(
      paramsResult.data.id,
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Post("/customer/location-bootstrap")
  async bootstrapCustomerLocation(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = request.user?.sub;
    if (!authUserId) throw Errors.unauthorized();

    const bodyResult = LocationBootstrapSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerLocationService.bootstrap(bodyResult.data, authUserId);
    return ResponseHandler.success(data);
  }

  @Get("/customer/location/options")
  async getCustomerLocationOptions(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = request.user?.sub;
    if (!authUserId) throw Errors.unauthorized();

    const data = await customerLocationService.getOptions();
    return ResponseHandler.success(data);
  }

  @Post("/customer/location-bootstrap/confirm")
  async confirmCustomerLocation(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = request.user?.sub;
    if (!authUserId) throw Errors.unauthorized();

    const bodyResult = LocationBootstrapConfirmSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerLocationService.confirm(bodyResult.data, authUserId);
    return ResponseHandler.success(data);
  }
}

export default new TenantServiceAreasController();
