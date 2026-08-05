import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreatePlatformTenantSchema,
  PlatformTenantIdParamsSchema,
  PlatformTenantListQuerySchema,
  UpdatePlatformTenantSchema,
} from "@/schema/platform-tenants";
import { platformTenantService } from "@/services/platform-tenants";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformTenantsController extends PlatformBaseController {
  constructor() {
    super("tenants");
  }

  @Get("/platform/tenants")
  async listTenants(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.tenant.read",
    );

    const queryResult = PlatformTenantListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformTenantService.list(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/tenants")
  async createTenant(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.tenant.manage",
    );

    const bodyResult = CreatePlatformTenantSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformTenantService.create(bodyResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/tenants/:id")
  async getTenant(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.tenant.read",
    );

    const paramsResult = PlatformTenantIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformTenantService.getDetail(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/tenants/:id")
  async updateTenant(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.tenant.manage",
    );

    const paramsResult = PlatformTenantIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdatePlatformTenantSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformTenantService.update(
      paramsResult.data.id,
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/tenants/:id/suspend")
  async suspendTenant(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.tenant.status.manage",
    );

    const paramsResult = PlatformTenantIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformTenantService.suspend(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/tenants/:id/activate")
  async activateTenant(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.tenant.status.manage",
    );

    const paramsResult = PlatformTenantIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformTenantService.activate(paramsResult.data.id, authContext);
    return ResponseHandler.success(data);
  }
}

export default new PlatformTenantsController();
