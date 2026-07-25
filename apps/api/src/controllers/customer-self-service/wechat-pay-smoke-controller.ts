import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerWechatPaySmokeOrderSchema,
  CustomerWechatPaySmokeOrderParamSchema,
} from "@/schema/customer-wechat-pay-smoke";
import {
  customerWechatPaySmokeService,
} from "@/services/customer-wechat-pay-smoke";
import { Get, Post, registerRoutes } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CustomerSelfServiceBaseController } from "./shared";

class CustomerWechatPaySmokeController extends CustomerSelfServiceBaseController {
  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    registerRoutes(fastify, this);
  };

  @Post("/customer/wechat-pay/smoke-test-orders")
  async createOrder(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    if (!customer?.tenant_id) throw Errors.forbidden();
    const bodyResult = CreateCustomerWechatPaySmokeOrderSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerWechatPaySmokeService.createOrder(
      { tenantId: customer.tenant_id, customerId: customer.id },
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/customer/wechat-pay/smoke-test-orders/:id")
  async getOrder(request: FastifyRequest, reply: FastifyReply) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    if (!customer?.tenant_id) throw Errors.forbidden();
    const paramsResult = CustomerWechatPaySmokeOrderParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerWechatPaySmokeService.getOrder(
      { tenantId: customer.tenant_id, customerId: customer.id },
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }
}

export default new CustomerWechatPaySmokeController();
