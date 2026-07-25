import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateWechatPayApplymentSchema,
  SubmitWechatPayApplymentSchema,
  UpdateWechatPayApplymentSchema,
  WechatPayApplymentIdParamSchema,
} from "@/schema/wechat-pay-applyments";
import {
  WechatPaySettlementRuleListQuerySchema,
} from "@/schema/wechat-pay-settlement-rules";
import { UpdateWechatPayConfigSchema } from "@/schema/wechat-pay-configs";
import {
  CreateWechatPayOrderSchema,
  WechatPayOrderListQuerySchema,
} from "@/schema/wechat-pay-orders";
import { wechatPayApplymentService } from "@/services/wechat-pay-applyments";
import { wechatPayConfigService } from "@/services/wechat-pay-configs";
import { wechatPayOrderService } from "@/services/wechat-pay-orders";
import {
  wechatPaySettlementRuleService,
} from "@/services/wechat-pay-settlement-rules";
import { Get, Post, Put, registerRoutes } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

class FinanceWechatPayController extends TenantBaseController {
  constructor() {
    super("finance-wechat-pay");
  }

  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    registerRoutes(fastify, this);
  };

  @Get("/finance/wechat-pay/config")
  async getWechatPayConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);

    const data = await wechatPayConfigService.getConfig(authContext);
    return ResponseHandler.success(data);
  }

  @Put("/finance/wechat-pay/config")
  async saveWechatPayConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = UpdateWechatPayConfigSchema.safeParse(request.body || {});
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await wechatPayConfigService.saveConfig(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/wechat-pay/applyment/current")
  async getWechatPayApplymentCurrent(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const data = await wechatPayApplymentService.getCurrent(authContext);
    return ResponseHandler.success(data);
  }

  @Get("/finance/wechat-pay/settlement-rules")
  async listWechatPaySettlementRules(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    await this.getRequiredTenantContext(request);
    const queryResult = WechatPaySettlementRuleListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await wechatPaySettlementRuleService.listTenantOptions(
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/wechat-pay/applyments")
  async createWechatPayApplyment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = CreateWechatPayApplymentSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await wechatPayApplymentService.createDraft(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/wechat-pay/applyments/:id")
  async getWechatPayApplyment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) {
      throw Errors.fromZod(paramsResult.error);
    }

    const data = await wechatPayApplymentService.getTenantDetail(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Put("/finance/wechat-pay/applyments/:id")
  async updateWechatPayApplyment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) {
      throw Errors.fromZod(paramsResult.error);
    }
    const bodyResult = UpdateWechatPayApplymentSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await wechatPayApplymentService.updateDraft(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/wechat-pay/applyments/:id/draft-session")
  async claimWechatPayApplymentDraftSession(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) {
      throw Errors.fromZod(paramsResult.error);
    }
    const data = await wechatPayApplymentService.claimDraftSession(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/wechat-pay/applyments/:id/submit")
  async submitWechatPayApplyment(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WechatPayApplymentIdParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) {
      throw Errors.fromZod(paramsResult.error);
    }
    const bodyResult = SubmitWechatPayApplymentSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await wechatPayApplymentService.submit(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/wechat-pay/orders")
  async listWechatPayOrders(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = WechatPayOrderListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await wechatPayOrderService.listOrders(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/wechat-pay/orders")
  async createWechatPayOrder(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = CreateWechatPayOrderSchema.safeParse(request.body || {});
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await wechatPayOrderService.createOrder(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new FinanceWechatPayController();
