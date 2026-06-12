import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ApproveExpenseRequestSchema,
  CancelExpenseRequestSchema,
  CreateExpenseRequestSchema,
  ExpenseApprovalCandidateQuerySchema,
  ExpenseApprovalTemplateQuerySchema,
  ExpenseRequestListQuerySchema,
  ExpenseRequestProjectCandidateQuerySchema,
  ExpenseRequestTodoQuerySchema,
  PayExpenseRequestSchema,
  RejectExpenseRequestSchema,
  SubmitExpenseRequestSchema,
  UpdateExpenseRequestSchema,
} from "@/schema/expense-requests";
import type { AuthContext } from "@/services/authorization";
import { expenseRequestService } from "@/services/expense-requests";
import { workflowSubjectsService } from "@/services/workflow-subjects";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class ExpenseRequestsController extends TenantBaseController<
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

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const result = ExpenseRequestListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.listExpenseRequests(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await expenseRequestService.getExpenseRequestById(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(
      await this.withWorkflowState(authContext, idVerify.data.id, data),
    );
  };

  @Get("/expense-requests/approval-template")
  async approvalTemplate(request: FastifyRequest, reply: FastifyReply) {
    await this.getRequiredTenantContext(request);
    const result = ExpenseApprovalTemplateQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = expenseRequestService.getApprovalTemplate(result.data);
    return ResponseHandler.success(data);
  }

  @Get("/expense-requests/approval-candidates")
  async approvalCandidates(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const result = ExpenseApprovalCandidateQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.listApprovalCandidates(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/expense-requests/todo")
  async todo(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const result = ExpenseRequestTodoQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.listTodoExpenseRequests(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/expense-requests/project-candidates")
  async projectCandidates(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const result = ExpenseRequestProjectCandidateQuerySchema.safeParse(
      request.query,
    );
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.listProjectCandidates(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/expense-requests/stats/summary")
  async statsSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const result = ExpenseRequestListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.getStatsSummary(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
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
    const authContext = await this.getRequiredTenantContext(request);
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
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = SubmitExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.submitExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(
      await this.withWorkflowState(authContext, idVerify.data.id, data),
    );
  }

  @Post("/expense-requests/:id/approve")
  async approve(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = ApproveExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.approveExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(
      await this.withWorkflowState(authContext, idVerify.data.id, data),
    );
  }

  @Post("/expense-requests/:id/reject")
  async reject(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = RejectExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.rejectExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(
      await this.withWorkflowState(authContext, idVerify.data.id, data),
    );
  }

  @Post("/expense-requests/:id/cancel")
  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = CancelExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.cancelExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(
      await this.withWorkflowState(authContext, idVerify.data.id, data),
    );
  }

  @Post("/expense-requests/:id/pay")
  async pay(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = PayExpenseRequestSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestService.payExpenseRequest(
      authContext,
      idVerify.data.id,
      result.data,
    );

    return ResponseHandler.success(
      await this.withWorkflowState(authContext, idVerify.data.id, data),
    );
  }

  private async withWorkflowState(
    authContext: AuthContext,
    expenseRequestId: string,
    data: unknown,
  ) {
    const workflowState = await workflowSubjectsService.getState(authContext, {
      subjectType: "expense_request",
      subjectId: expenseRequestId,
    });
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return data;
    }

    return {
      ...(data as Record<string, unknown>),
      ...workflowState,
    };
  }
}

export default new ExpenseRequestsController();
