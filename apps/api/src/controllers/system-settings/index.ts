import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  SystemSettingKeyParamsSchema,
  UpdateSystemSettingSchema,
} from "@/schema/system-settings";
import type { AuthContext } from "@/services/authorization";
import { systemSettingsService } from "@/services/system-settings";
import { Get, Patch } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class SystemSettingsController extends TenantBaseController {
  constructor() {
    super("system_settings");
  }

  private async getRequiredPlatformSettingsContext(request: FastifyRequest) {
    const authContext = await this.getRequiredAuthContext(request);
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
    return authContext;
  }

  private assertSettingsPermission(
    authContext: AuthContext,
    permissionCode: "system.settings.read" | "system.settings.update",
  ) {
    if (authContext.isPlatformAdmin) return;
    this.assertPermission(authContext, permissionCode);
  }

  @Get("/platform/system-settings")
  async listPlatformSettings(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSettingsContext(request);

    const data = await systemSettingsService.listSettings(authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/system-settings/:key")
  async updatePlatformSetting(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSettingsContext(request);

    const paramsResult = SystemSettingKeyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateSystemSettingSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await systemSettingsService.updateSetting(
      authContext,
      paramsResult.data.key,
      bodyResult.data.value,
    );
    return ResponseHandler.success(data);
  }

  @Get("/tenant/system-settings")
  async listTenantSettings(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "system.settings.read");

    const data = await systemSettingsService.listSettings(authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/tenant/system-settings/:key")
  async updateTenantSetting(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "system.settings.update");

    const paramsResult = SystemSettingKeyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateSystemSettingSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await systemSettingsService.updateSetting(
      authContext,
      paramsResult.data.key,
      bodyResult.data.value,
    );
    return ResponseHandler.success(data);
  }

  @Get("/admin/system-settings")
  async listSettings(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertSettingsPermission(authContext, "system.settings.read");

    const data = await systemSettingsService.listSettings(authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/admin/system-settings/:key")
  async updateSetting(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertSettingsPermission(authContext, "system.settings.update");

    const paramsResult = SystemSettingKeyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateSystemSettingSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await systemSettingsService.updateSetting(
      authContext,
      paramsResult.data.key,
      bodyResult.data.value,
    );
    return ResponseHandler.success(data);
  }
}

export default new SystemSettingsController();
