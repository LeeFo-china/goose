import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  ServiceFulfillmentAttachmentPreviewParamSchema,
  ServiceAcceptanceDecisionSchema,
  ServiceOrderActionSchema,
  ServiceOrderCreateSchema,
  ServiceOrderListQuerySchema,
  ServiceOrderParamSchema,
  ServiceProductListQuerySchema,
  ServiceRefundRequestSchema,
} from "@/schema/billing-service-orders";
import { authorizationService } from "@/services/authorization";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";

const SERVICE_MODULE = "../../services/tenant-platform-service-orders";

async function service() {
  return (await import(SERVICE_MODULE)).tenantPlatformServiceOrderService;
}

function requirePayerOpenid(request: FastifyRequest) {
  const openid = request.user?.openid?.trim();
  if (!openid || openid.length > 128) {
    throw Errors.business(
      401,
      "请使用已登录的微信小程序账号发起支付",
      "PAYER_OPENID_REQUIRED",
    );
  }
  return openid;
}

class BillingServiceOrdersController extends BaseController {
  constructor() {
    super("tenant_service_orders");
  }

  private async getBillingAllowedAuthContext(request: FastifyRequest) {
    return authorizationService.getRequiredAuthContext(request.user?.sub, {
      allowedWhenBillingLocked: true,
    });
  }

  @Get("/billing/service-products")
  async listProducts(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const queryResult = ServiceProductListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await (await service()).listProducts(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/billing/service-orders")
  async listOrders(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const queryResult = ServiceOrderListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await (await service()).listOrders(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/billing/service-orders")
  async createOrder(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const openid = requirePayerOpenid(request);
    const bodyResult = ServiceOrderCreateSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).createOrder(
      authContext,
      bodyResult.data,
      openid,
    );
    return ResponseHandler.success(data);
  }

  @Get("/billing/service-orders/:id")
  async getOrder(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = ServiceOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await (await service()).getOrder(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/billing/service-orders/:id/payment-request")
  async createPaymentRequest(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const openid = requirePayerOpenid(request);
    const paramsResult = ServiceOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ServiceOrderActionSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).createPaymentRequest(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
      openid,
    );
    return ResponseHandler.success(data);
  }

  @Post("/billing/service-orders/:id/refund-requests")
  async requestRefund(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = ServiceOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ServiceRefundRequestSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).requestRefund(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/billing/service-orders/:id/acceptance")
  async getAcceptance(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = ServiceOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await (await service()).getAcceptance(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/billing/service-orders/:id/acceptance/confirm")
  async confirmAcceptance(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = ServiceOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ServiceAcceptanceDecisionSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).confirmAcceptance(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/billing/service-orders/:id/acceptance/reject")
  async rejectAcceptance(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = ServiceOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ServiceAcceptanceDecisionSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await (await service()).rejectAcceptance(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/billing/service-orders/:id/fulfillment-attachments/:attachmentId/preview-url")
  async getFulfillmentAttachmentPreviewUrl(request: FastifyRequest) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = ServiceFulfillmentAttachmentPreviewParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await (await service()).getFulfillmentAttachmentPreviewUrl(
      authContext,
      paramsResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new BillingServiceOrdersController();
