import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { UpdateWechatPayConfigSchema } from "@/schema/wechat-pay-configs";
import {
  CreateWechatPayOrderSchema,
  WechatPayOrderListQuerySchema,
} from "@/schema/wechat-pay-orders";
import { wechatPayConfigService } from "@/services/wechat-pay-configs";
import { wechatPayOrderService } from "@/services/wechat-pay-orders";
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
