import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  ApproveExpenseRequestSchema,
  CancelExpenseRequestSchema,
  CreateExpenseRequestSchema,
  ExpenseRequestListQuerySchema,
  PayExpenseRequestSchema,
  RejectExpenseRequestSchema,
  SubmitExpenseRequestSchema,
  UpdateExpenseRequestSchema,
} from "@/schema/expense-requests";
import { expenseRequestService } from "@/services/expense-requests";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import { authorizationService } from "@/services/authorization";

class ExpenseRequestsController extends BaseController<
  typeof CreateExpenseRequestSchema,
  typeof UpdateExpenseRequestSchema
> {
  constructor() {
    super(
      "expense_requests",
      CreateExpenseRequestSchema,
      UpdateExpenseRequestSchema,
    );
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
    const result = ExpenseRequestListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.listExpenseRequests(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await expenseRequestService.getExpenseRequestById(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.createExpenseRequest(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.updateExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  @Post("/expense-requests/:id/submit")
  async submit(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = SubmitExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.submitExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }

  @Post("/expense-requests/:id/approve")
  async approve(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = ApproveExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.approveExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }

  @Post("/expense-requests/:id/reject")
  async reject(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = RejectExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.rejectExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }

  @Post("/expense-requests/:id/cancel")
  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = CancelExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.cancelExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }

  @Post("/expense-requests/:id/pay")
  async pay(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = PayExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.payExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(data);
  }
}

export default new ExpenseRequestsController();
