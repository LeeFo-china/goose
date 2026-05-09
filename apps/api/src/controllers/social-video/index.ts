import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateSocialVideoTranscriptionSchema,
  SocialVideoTranscriptionIdParamsSchema,
  TestSocialVideoTranscriptionSchema,
} from "@/schema/social-video";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { socialVideoTranscriptionService } from "@/services/social-video-transcriptions";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class SocialVideoController extends BaseController {
  constructor() {
    super("social_video_transcriptions");
  }

  private getRequiredAuthUserId(request: FastifyRequest) {
    const authUserId = request.user?.sub;
    if (!authUserId) {
      throw Errors.unauthorized();
    }

    return authUserId;
  }

  @Post("/social-video/transcriptions")
  async createTranscription(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);

    const bodyResult = CreateSocialVideoTranscriptionSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await socialVideoTranscriptionService.createTask(
      bodyResult.data,
      authUserId,
    );
    return ResponseHandler.success(data);
  }

  @Get("/social-video/transcriptions/:id")
  async getTranscription(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);

    const paramsResult = SocialVideoTranscriptionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await socialVideoTranscriptionService.getTask(
      paramsResult.data.id,
      authUserId,
    );
    return ResponseHandler.success(data);
  }

  @Post("/admin/social-video/transcriptions/test")
  async testApifyTranscription(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "system.settings.test");

    const bodyResult = TestSocialVideoTranscriptionSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await socialVideoTranscriptionService.testApify(bodyResult.data);
    return ResponseHandler.success(data);
  }
}

export default new SocialVideoController();
