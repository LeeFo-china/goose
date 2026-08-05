import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformRechargeOrderCompensateSchema,
  PlatformRechargeOrderParamSchema,
  PlatformRechargeOrderQuerySchema,
  PlatformRechargeProductCreateSchema,
  PlatformRechargeProductParamSchema,
  PlatformRechargeProductQuerySchema,
  PlatformRechargeProductUpdateSchema,
} from "@/schema/platform-billing-recharge";
import { platformBillingRechargeService } from "@/services/platform-billing-recharge";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformBillingRechargeController extends PlatformBaseController {
  constructor() {
    super("platform-billing-recharge");
  }

  @Get("/platform/billing/recharge-products")
  async listProducts(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingReadContext(request);
    const queryResult = PlatformRechargeProductQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformBillingRechargeService.listProducts(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/recharge-products")
  async createProduct(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRechargeProductManageContext(request);
    const bodyResult = PlatformRechargeProductCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformBillingRechargeService.createProduct(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/recharge-products/recommended")
  async applyRecommendedProducts(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRechargeProductManageContext(request);
    const data = await platformBillingRechargeService.applyRecommendedProducts(
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/platform/billing/recharge-products/:id")
  async updateProduct(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRechargeProductManageContext(request);
    const paramsResult = PlatformRechargeProductParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformRechargeProductUpdateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformBillingRechargeService.updateProduct(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/recharge-orders")
  async listOrders(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingReadContext(request);
    const queryResult = PlatformRechargeOrderQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformBillingRechargeService.listOrders(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/recharge-orders/:id")
  async getOrderDetail(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingReadContext(request);
    const paramsResult = PlatformRechargeOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformBillingRechargeService.getOrderDetail(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/recharge-orders/:id/compensate")
  async compensateOrder(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRechargeProductManageContext(request);
    const paramsResult = PlatformRechargeOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformRechargeOrderCompensateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformBillingRechargeService.compensateWechatOrder(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  private getBillingReadContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.billing.read");
  }

  private getRechargeProductManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.billing.recharge_product.manage");
  }
}

export default new PlatformBillingRechargeController();
