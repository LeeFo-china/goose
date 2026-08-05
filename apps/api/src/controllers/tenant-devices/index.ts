import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateTenantDeviceSchema,
  PlatformTencentDeviceParamsSchema,
  PlatformTencentDeviceListQuerySchema,
  PlatformTenantDeviceListQuerySchema,
  TenantDeviceListQuerySchema,
  TenantDeviceParamsSchema,
  UpdateTenantDeviceSchema,
} from "@/schema/tenant-devices";
import { platformAuthorizationService } from "@/services/platform-authorization";
import { tenantDeviceService } from "@/services/tenant-devices";
import { Delete, Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { PermissionCode } from "@gooes/domain";

class TenantDeviceController extends TenantBaseController {
  constructor() {
    super("tenant_devices");
  }

  @Get("/tenant-devices")
  async listTenantDevices(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = TenantDeviceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await tenantDeviceService.listTenantDevices({
      authContext,
      query: queryResult.data,
    });

    return ResponseHandler.success(result);
  }

  @Get("/platform/tenant-devices")
  async listPlatformTenantDevices(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformDeviceReadContext(request);
    const queryResult = PlatformTenantDeviceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await tenantDeviceService.listPlatformTenantDevices(
      queryResult.data,
      authContext,
    );

    return ResponseHandler.success(result);
  }

  @Get("/platform/tencent-devices")
  async listPlatformTencentDevices(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformDeviceReadContext(request);
    const queryResult = PlatformTencentDeviceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await tenantDeviceService.listPlatformTencentDevices(
      queryResult.data,
      authContext,
    );

    return ResponseHandler.success(result);
  }

  @Delete("/platform/tencent-devices/:device_id")
  async deletePlatformTencentDevice(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformDeviceManageContext(request);
    const paramsResult = PlatformTencentDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.deletePlatformTencentDevice(
      paramsResult.data.device_id,
      authContext,
    );

    return ResponseHandler.success(result);
  }

  @Get("/platform/tenant-devices/:id/tencent-access")
  async getPlatformTencentDeviceAccessInfo(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformDeviceReadContext(request);
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.getPlatformTencentDeviceAccessInfo(
      paramsResult.data.id,
      authContext,
    );

    return ResponseHandler.success(result);
  }

  @Get("/platform/tenant-devices/:id/tencent-password")
  async getPlatformTencentDevicePassword(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformDeviceManageContext(request);
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.getPlatformTencentDevicePassword(
      paramsResult.data.id,
      authContext,
    );

    return ResponseHandler.success(result);
  }

  @Post("/platform/tenant-devices/:id/tencent-password")
  async resetPlatformTencentDevicePassword(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformDeviceManageContext(request);
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.resetPlatformTencentDevicePassword(
      paramsResult.data.id,
      authContext,
    );

    return ResponseHandler.success(result);
  }

  @Post("/platform/tenant-devices/:id/sync")
  async syncPlatformTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getPlatformDeviceManageContext(request);
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.syncPlatformTenantDevice(
      paramsResult.data.id,
      authContext,
    );

    return ResponseHandler.success(result);
  }

  @Get("/tenant-devices/:id")
  async getTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.getTenantDevice({
      authContext,
      id: paramsResult.data.id,
    });

    return ResponseHandler.success(result);
  }

  @Post("/tenant-devices")
  async createTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = CreateTenantDeviceSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const result = await tenantDeviceService.createTenantDevice({
      authContext,
      payload: bodyResult.data,
    });

    return ResponseHandler.success(result);
  }

  @Post("/tenant-devices/sync")
  async syncTenantDevices(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const result = await tenantDeviceService.syncTenantDevices({
      authContext,
    });

    return ResponseHandler.success(result);
  }

  @Patch("/tenant-devices/:id")
  async updateTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateTenantDeviceSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const result = await tenantDeviceService.updateTenantDevice({
      authContext,
      id: paramsResult.data.id,
      payload: bodyResult.data,
    });

    return ResponseHandler.success(result);
  }

  @Delete("/tenant-devices/:id")
  async deleteTenantDevice(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = TenantDeviceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const result = await tenantDeviceService.deleteTenantDevice({
      authContext,
      id: paramsResult.data.id,
    });

    return ResponseHandler.success(result);
  }

  private getPlatformDeviceReadContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.device.read");
  }

  private getPlatformDeviceManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.device.manage");
  }

  private async getRequiredPlatformPermissionContext(
    request: FastifyRequest,
    permissionCode: PermissionCode,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
    const isPlatformIdentity =
      authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    platformAuthorizationService.assertPermission(authContext, permissionCode);
    return authContext;
  }
}

export default new TenantDeviceController();
