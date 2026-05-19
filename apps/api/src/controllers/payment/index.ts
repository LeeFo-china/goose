import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreatePaymentSchema,
  PaymentListQuerySchema,
  UpdatePaymentSchema,
} from "@/schema/payment";
import { authorizationService } from "@/services/authorization";
import { paymentService } from "@/services/payments";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PaymentController extends BaseController<
  typeof CreatePaymentSchema,
  typeof UpdatePaymentSchema
> {
  constructor() {
    super("payments", CreatePaymentSchema, UpdatePaymentSchema);
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const queryResult = PaymentListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await paymentService.listPayments(authContext, queryResult.data);
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await paymentService.getPaymentById(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const result = CreatePaymentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await paymentService.createPayment(authContext, result.data);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = UpdatePaymentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await paymentService.updatePayment(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  };
}

export default new PaymentController();
