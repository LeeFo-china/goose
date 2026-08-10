import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateSocialVideoScriptSchema,
  CreateSocialVideoTranscriptionSchema,
  ListSocialVideoScriptsQuerySchema,
  SocialVideoUsageSummaryQuerySchema,
  SocialVideoTranscriptionIdParamsSchema,
  TestSocialVideoTranscriptionSchema,
} from "@/schema/social-video";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { socialVideoScriptService } from "@/services/social-video-scripts";
import { socialVideoTranscriptionService } from "@/services/social-video-transcriptions";
import { getTenantServiceAuthOptions } from "@/services/tenant-service-route-access";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class SocialVideoController extends BaseController {
  constructor() {
    super("social_video_transcriptions");
  }

  @Post("/social-video/transcriptions")
  async createTranscription(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );

    const bodyResult = CreateSocialVideoTranscriptionSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await socialVideoTranscriptionService.createTask(
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/social-video/transcriptions/:id")
  async getTranscription(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );

    const paramsResult = SocialVideoTranscriptionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await socialVideoTranscriptionService.getTask(
      paramsResult.data.id,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Post("/social-video/transcriptions/:id/script")
  async generateScript(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );

    const paramsResult = SocialVideoTranscriptionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = CreateSocialVideoScriptSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await socialVideoScriptService.generateScript(
      paramsResult.data.id,
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/social-video/transcriptions/:id/scripts")
  async listScripts(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );

    const paramsResult = SocialVideoTranscriptionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = ListSocialVideoScriptsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await socialVideoScriptService.listScripts(
      paramsResult.data.id,
      queryResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Post("/admin/social-video/transcriptions/test")
  async testApifyTranscription(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );
    accessPolicyService.assertPermission(authContext, "system.settings.test");

    const bodyResult = TestSocialVideoTranscriptionSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await socialVideoTranscriptionService.testApify(bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/social-video/scripts")
  async listAdminScripts(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );

    const queryResult = ListSocialVideoScriptsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await socialVideoScriptService.listAdminScripts(
      queryResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/social-video/scripts")
  async listPlatformScripts(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);

    const queryResult = ListSocialVideoScriptsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await socialVideoScriptService.listPlatformScripts(
      queryResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/admin/social-video/usage-summary")
  async getUsageSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );

    const queryResult = SocialVideoUsageSummaryQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await socialVideoScriptService.getUsageSummary(
      queryResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }
}

export default new SocialVideoController();
