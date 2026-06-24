import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateFinanceCostCategorySchema,
  FinanceCostCategoryListQuerySchema,
  UpdateFinanceLedgerCostCategorySchema,
  SaveProjectCostBudgetsSchema,
  UpdateFinanceCostCategorySchema,
} from "@/schema/finance-costs";
import {
  FinanceLedgerListQuerySchema,
  FinanceProjectSummaryListQuerySchema,
} from "@/schema/finance";
import { FinanceReceivableListQuerySchema } from "@/schema/finance-receivables";
import { financeCostCategoryService } from "@/services/finance-cost-categories";
import { financeLedgerService } from "@/services/finance-ledger";
import { financeProjectSummaryService } from "@/services/finance-project-summary";
import { projectCostBudgetService } from "@/services/project-cost-budgets";
import { projectReceivablesService } from "@/services/project-receivables";
import { Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class FinanceController extends TenantBaseController {
  constructor() {
    super("finance");
  }

  @Get("/finance/ledger")
  async listLedger(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceLedgerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await financeLedgerService.listLedger(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/finance/ledger/:id/cost-category")
  async updateLedgerCostCategory(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = UpdateFinanceLedgerCostCategorySchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await financeLedgerService.updateCostCategory(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/receivables")
  async listReceivables(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceReceivableListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await projectReceivablesService.listReceivables(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/project-summary")
  async listProjectSummaries(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceProjectSummaryListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await financeProjectSummaryService.listProjectSummaries(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/cost-categories")
  async listCostCategories(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceCostCategoryListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await financeCostCategoryService.list(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/cost-categories")
  async createCostCategory(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = CreateFinanceCostCategorySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await financeCostCategoryService.create(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/finance/cost-categories/:id")
  async updateCostCategory(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = UpdateFinanceCostCategorySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await financeCostCategoryService.update(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/projects/:id/cost-budgets")
  async listProjectCostBudgets(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectCostBudgetService.listProjectBudgets(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Put("/projects/:id/cost-budgets")
  async saveProjectCostBudgets(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = SaveProjectCostBudgetsSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await projectCostBudgetService.saveProjectBudgets(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/projects/:id/finance-summary")
  async getProjectFinanceSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await financeProjectSummaryService.getProjectSummary(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  }
}

export default new FinanceController();
