import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformTenantUsageQuerySchema,
  UsageAiLogsQuerySchema,
  UsageDateRangeQuerySchema,
  UsageSmsLogsQuerySchema,
  UsageSocialVideoLogsQuerySchema,
} from "@/schema/usage";
import { authorizationService } from "@/services/authorization";
import { usageService } from "@/services/usage";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class UsageController extends BaseController {
  constructor() {
    super("tenant_usage_daily");
  }

  @Get("/usage/summary")
  async getTenantSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = UsageDateRangeQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.getTenantSummary(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/usage/ai-logs")
  async listTenantAiLogs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = UsageAiLogsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.listTenantAiLogs(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/usage/sms-logs")
  async listTenantSmsLogs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = UsageSmsLogsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.listTenantSmsLogs(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/usage/social-video-logs")
  async listTenantSocialVideoLogs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = UsageSocialVideoLogsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.listTenantSocialVideoLogs(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/usage/tenants")
  async listPlatformTenantUsage(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = PlatformTenantUsageQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.listPlatformTenantUsage(
      queryResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/usage/overview")
  async getPlatformOverview(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = UsageDateRangeQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.getPlatformOverview(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/usage/ai-logs")
  async listPlatformAiLogs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = UsageAiLogsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.listPlatformAiLogs(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/usage/sms-logs")
  async listPlatformSmsLogs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = UsageSmsLogsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.listPlatformSmsLogs(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/usage/social-video-logs")
  async listPlatformSocialVideoLogs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = UsageSocialVideoLogsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await usageService.listPlatformSocialVideoLogs(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }
}

export default new UsageController();
