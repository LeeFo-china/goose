import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ActivateWechatPayApplymentConfigSchema,
  ApproveWechatPayApplymentSchema,
  MarkWechatPayApplymentApplyingSchema,
  PlatformWechatPayApplymentListQuerySchema,
  RejectWechatPayApplymentSchema,
  UpdateWechatPayApplymentWechatStatusSchema,
  WechatPayApplymentIdParamSchema,
} from "@/schema/wechat-pay-applyments";
import { wechatPayApplymentService } from "@/services/wechat-pay-applyments";
import { Get, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformWechatPayApplymentsController extends PlatformBaseController {
  constructor() {
    super("platform-wechat-pay-applyments");
  }

  @Get("/platform/finance/wechat-pay/applyments")
  async listApplyments(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const queryResult = PlatformWechatPayApplymentListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await wechatPayApplymentService.listForPlatform(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/finance/wechat-pay/applyments/:id")
  async getApplyment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await wechatPayApplymentService.getPlatformDetail(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/finance/wechat-pay/applyments/:id/approve")
  async approveApplyment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ApproveWechatPayApplymentSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await wechatPayApplymentService.approve(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/finance/wechat-pay/applyments/:id/reject")
  async rejectApplyment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = RejectWechatPayApplymentSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await wechatPayApplymentService.reject(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/finance/wechat-pay/applyments/:id/mark-applying")
  async markApplymentApplying(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = MarkWechatPayApplymentApplyingSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await wechatPayApplymentService.markApplying(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Put("/platform/finance/wechat-pay/applyments/:id/wechat-status")
  async updateApplymentWechatStatus(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateWechatPayApplymentWechatStatusSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await wechatPayApplymentService.updateWechatStatus(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/finance/wechat-pay/applyments/:id/activate-config")
  async activateApplymentConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ActivateWechatPayApplymentConfigSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await wechatPayApplymentService.activateConfig(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformWechatPayApplymentsController();
