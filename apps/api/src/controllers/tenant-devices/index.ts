import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateTenantDeviceSchema,
  PlatformTenantDeviceListQuerySchema,
  TenantDeviceListQuerySchema,
  TenantDeviceParamsSchema,
  UpdateTenantDeviceSchema,
} from "@/schema/tenant-devices";
import { authorizationService } from "@/services/authorization";
import { tenantDeviceService } from "@/services/tenant-devices";
import { Delete, Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class TenantDeviceController extends BaseController {
  constructor() {
    super("tenant_devices");
  }

  @Get("/tenant-devices")
  async listTenantDevices(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = TenantDeviceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await tenantDeviceService.listTenantDevices({
      authUserId: request.user?.sub,
      query: queryResult.data,
    });

    return ResponseHandler.success(result);
  }

  @Get("/platform/tenant-devices")
  async listPlatformTenantDevices(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = PlatformTenantDeviceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await tenantDeviceService.listPlatformTenantDevices(
      queryResult.data,
      authContext,
    );

    return ResponseHandler.success(result);
  }

  @Get("/tenant-devices/:id")
  async getTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.getTenantDevice({
      authUserId: request.user?.sub,
      id: paramsResult.data.id,
    });

    return ResponseHandler.success(result);
  }

  @Post("/tenant-devices")
  async createTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = CreateTenantDeviceSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const result = await tenantDeviceService.createTenantDevice({
      authUserId: request.user?.sub,
      payload: bodyResult.data,
    });

    return ResponseHandler.success(result);
  }

  @Post("/tenant-devices/sync")
  async syncTenantDevices(request: FastifyRequest, reply: FastifyReply) {
    const result = await tenantDeviceService.syncTenantDevices({
      authUserId: request.user?.sub,
    });

    return ResponseHandler.success(result);
  }

  @Patch("/tenant-devices/:id")
  async updateTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateTenantDeviceSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const result = await tenantDeviceService.updateTenantDevice({
      authUserId: request.user?.sub,
      id: paramsResult.data.id,
      payload: bodyResult.data,
    });

    return ResponseHandler.success(result);
  }

  @Delete("/tenant-devices/:id")
  async deleteTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.deleteTenantDevice({
      authUserId: request.user?.sub,
      id: paramsResult.data.id,
    });

    return ResponseHandler.success(result);
  }
}

export default new TenantDeviceController();
