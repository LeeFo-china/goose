import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  BillingRechargeCreateOrderSchema,
  BillingRechargeOrderQuerySchema,
  BillingRechargeOrderParamSchema,
  BillingRechargeProductQuerySchema,
  BillingRechargeRefundRequestSchema,
} from "@/schema/billing-recharge";
import { authorizationService } from "@/services/authorization";
import { billingRechargeService } from "@/services/billing-recharge";
import { getTenantServiceAuthOptions } from "@/services/tenant-service-route-access";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class BillingRechargeController extends BaseController {
  constructor() {
    super("tenant_credit_orders");
  }

  private async getBillingAllowedAuthContext(request: FastifyRequest) {
    return authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );
  }

  @Get("/billing/recharge-products", { tenantServiceAccess: "recovery" })
  async listProducts(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const queryResult = BillingRechargeProductQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingRechargeService.listProducts(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/billing/recharge-orders", { tenantServiceAccess: "recovery" })
  async listOrders(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const queryResult = BillingRechargeOrderQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingRechargeService.listOrders(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/billing/recharge-orders", { tenantServiceAccess: "recovery" })
  async createOrder(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const bodyResult = BillingRechargeCreateOrderSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await billingRechargeService.createOrder(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/billing/recharge-orders/:id", {
    tenantServiceAccess: "recovery",
  })
  async getOrder(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = BillingRechargeOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await billingRechargeService.getOrder(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/billing/recharge-orders/:id/payment-request", {
    tenantServiceAccess: "recovery",
  })
  async createPaymentRequest(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = BillingRechargeOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await billingRechargeService.createPaymentRequest(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/billing/recharge-orders/:id/refund-requests", {
    tenantServiceAccess: "write",
  })
  async requestRefund(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = BillingRechargeOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = BillingRechargeRefundRequestSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await billingRechargeService.requestRefund(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new BillingRechargeController();
