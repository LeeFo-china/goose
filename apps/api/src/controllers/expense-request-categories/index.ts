import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateExpenseRequestCategorySchema,
  ExpenseRequestCategoryIdParamsSchema,
  ExpenseRequestCategoryListQuerySchema,
  ExpenseRequestCategoryStatusUpdateSchema,
  UpdateExpenseRequestCategorySchema,
} from "@/schema/expense-request-categories";
import { expenseRequestCategoryService } from "@/services/expense-request-categories";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class ExpenseRequestCategoriesController extends TenantBaseController<
  typeof CreateExpenseRequestCategorySchema,
  typeof UpdateExpenseRequestCategorySchema
> {
  constructor() {
    super(
      "expense_request_categories",
      CreateExpenseRequestCategorySchema,
      UpdateExpenseRequestCategorySchema,
    );
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const result = ExpenseRequestCategoryListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestCategoryService.listCategories(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const result = ExpenseRequestCategoryIdParamsSchema.safeParse(request.params);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestCategoryService.getCategoryById(
      authContext,
      result.data.id,
    );
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const result = this.createSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestCategoryService.createCategory(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = ExpenseRequestCategoryIdParamsSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestCategoryService.updateCategory(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  @Post("/expense-request-categories/:id/status")
  async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = ExpenseRequestCategoryIdParamsSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = ExpenseRequestCategoryStatusUpdateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await expenseRequestCategoryService.updateCategoryStatus(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new ExpenseRequestCategoriesController();
