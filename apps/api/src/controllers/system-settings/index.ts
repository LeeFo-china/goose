import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  SystemSettingKeyParamsSchema,
  UpdateSystemSettingSchema,
} from "@/schema/system-settings";
import type { AuthContext } from "@/services/authorization";
import { platformAuthorizationService } from "@/services/platform-authorization";
import { systemSettingsService } from "@/services/system-settings";
import { tencentLbsService } from "@/services/tencent-lbs";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { PermissionCode } from "@gooes/domain";
import type { FastifyReply, FastifyRequest } from "fastify";

type TenantSystemSettingsPermission = Extract<
  PermissionCode,
  "system.settings.read" | "system.settings.update" | "system.settings.test"
>;
type PlatformSystemSettingsPermission = Extract<
  PermissionCode,
  "platform.system_setting.read" | "platform.system_setting.manage"
>;

class SystemSettingsController extends TenantBaseController {
  constructor() {
    super("system_settings");
  }

  private async getRequiredPlatformSettingsContext(
    request: FastifyRequest,
    permissionCode: PlatformSystemSettingsPermission,
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

  private assertSettingsPermission(
    authContext: AuthContext,
    permissionCode: TenantSystemSettingsPermission,
    platformPermissionCode: PlatformSystemSettingsPermission,
  ) {
    const isPlatformIdentity =
      authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
    if (authContext.tenantId === null && isPlatformIdentity) {
      platformAuthorizationService.assertPermission(
        authContext,
        platformPermissionCode,
      );
      return;
    }
    this.assertPermission(authContext, permissionCode);
  }

  @Get("/platform/system-settings")
  async listPlatformSettings(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSettingsContext(
      request,
      "platform.system_setting.read",
    );

    const data = await systemSettingsService.listSettings(authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/system-settings/:key")
  async updatePlatformSetting(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformSettingsContext(
      request,
      "platform.system_setting.manage",
    );

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

  @Post("/platform/system-settings/tencent-lbs/test")
  async testPlatformTencentLbs(request: FastifyRequest, reply: FastifyReply) {
    await this.getRequiredPlatformSettingsContext(
      request,
      "platform.system_setting.manage",
    );

    const data = await tencentLbsService.testWebserviceConfig();
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
    this.assertSettingsPermission(
      authContext,
      "system.settings.read",
      "platform.system_setting.read",
    );

    const data = await systemSettingsService.listSettings(authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/admin/system-settings/:key")
  async updateSetting(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertSettingsPermission(
      authContext,
      "system.settings.update",
      "platform.system_setting.manage",
    );

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

  @Post("/admin/system-settings/tencent-lbs/test")
  async testTencentLbs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    this.assertSettingsPermission(
      authContext,
      "system.settings.test",
      "platform.system_setting.manage",
    );

    const data = await tencentLbsService.testWebserviceConfig();
    return ResponseHandler.success(data);
  }
}

export default new SystemSettingsController();
