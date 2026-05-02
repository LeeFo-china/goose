import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  SystemSettingKeyParamsSchema,
  UpdateSystemSettingSchema,
} from "@/schema/system-settings";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { systemSettingsService } from "@/services/system-settings";
import { Get, Patch } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class SystemSettingsController extends BaseController {
  constructor() {
    super("system_settings");
  }

  @Get("/admin/system-settings")
  async listSettings(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "system.settings.read");

    const data = await systemSettingsService.listSettings();
    return ResponseHandler.success(data);
  }

  @Patch("/admin/system-settings/:key")
  async updateSetting(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "system.settings.update");

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
