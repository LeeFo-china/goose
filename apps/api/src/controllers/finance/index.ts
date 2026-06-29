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
import { FinanceOperatingReportQuerySchema } from "@/schema/finance-reports";
import {
  CreateFinanceReconciliationExceptionActionSchema,
  FinanceReconciliationExceptionActionListQuerySchema,
  FinanceReconciliationExceptionFingerprintParamsSchema,
  FinanceReconciliationExceptionListQuerySchema,
} from "@/schema/finance-reconciliation";
import {
  CancelFinanceReceivableSchema,
  CreateFinanceReceivableAllocationSchema,
  CreateFinanceReceivableFollowUpSchema,
  CreateFinanceReceivableSchema,
  FinanceReceivableEventListQuerySchema,
  FinanceReceivableListQuerySchema,
  ReverseFinanceReceivableAllocationSchema,
  UpdateFinanceReceivableAllocationSchema,
  UpdateFinanceReceivableSchema,
} from "@/schema/finance-receivables";
import { financeCostCategoryService } from "@/services/finance-cost-categories";
import { financeLedgerService } from "@/services/finance-ledger";
import { financeOperatingReportService } from "@/services/finance-operating-report";
import { financeProjectSummaryService } from "@/services/finance-project-summary";
import { financeReconciliationService } from "@/services/finance-reconciliation";
import { projectCostBudgetService } from "@/services/project-cost-budgets";
import { projectReceivablesService } from "@/services/project-receivables";
import {
  projectReceivableAllocationsService,
} from "@/services/project-receivable-allocations";
import {
  projectReceivableOperationsService,
} from "@/services/project-receivables-operations";
import { Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const AllocationIdParamSchema = z.object({
  allocationId: z.uuid("无效的核销记录 ID"),
});

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

  @Get("/finance/reconciliation/exceptions")
  async listReconciliationExceptions(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceReconciliationExceptionListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await financeReconciliationService.listExceptions(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/reconciliation/project/:id")
  async getProjectReconciliationSummary(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await financeReconciliationService.getProjectSummary(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/reconciliation/exceptions/:fingerprint/actions")
  async createReconciliationExceptionAction(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult =
      FinanceReconciliationExceptionFingerprintParamsSchema.safeParse(
        request.params,
      );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = CreateFinanceReconciliationExceptionActionSchema
      .safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await financeReconciliationService.createExceptionAction(
      authContext,
      paramsResult.data.fingerprint,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/reconciliation/exceptions/:fingerprint/actions")
  async listReconciliationExceptionActions(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult =
      FinanceReconciliationExceptionFingerprintParamsSchema.safeParse(
        request.params,
      );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = FinanceReconciliationExceptionActionListQuerySchema
      .safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await financeReconciliationService.listExceptionActions(
      authContext,
      paramsResult.data.fingerprint,
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

  @Post("/finance/receivables")
  async createReceivable(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = CreateFinanceReceivableSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService
      .createManualReceivable(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/finance/receivables/:id")
  async updateReceivable(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = UpdateFinanceReceivableSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService.updateReceivable(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables/:id/cancel")
  async cancelReceivable(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = CancelFinanceReceivableSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService.cancelReceivable(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables/:id/follow-ups")
  async createReceivableFollowUp(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = CreateFinanceReceivableFollowUpSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService.createFollowUp(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/receivables/:id/allocation-context")
  async getReceivableAllocationContext(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectReceivableAllocationsService.getAllocationContext(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables/:id/allocations")
  async createReceivableAllocation(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = CreateFinanceReceivableAllocationSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableAllocationsService
      .createManualAllocation(authContext, idVerify.data.id, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/finance/receivables/:id/allocations/:allocationId")
  async updateReceivableAllocation(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const allocationIdResult = AllocationIdParamSchema.safeParse(request.params);
    if (!allocationIdResult.success) {
      throw Errors.fromZod(allocationIdResult.error);
    }

    const bodyResult = UpdateFinanceReceivableAllocationSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableAllocationsService
      .adjustManualAllocation(
        authContext,
        idVerify.data.id,
        allocationIdResult.data.allocationId,
        bodyResult.data,
      );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables/:id/allocations/:allocationId/reverse")
  async reverseReceivableAllocation(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const allocationIdResult = AllocationIdParamSchema.safeParse(request.params);
    if (!allocationIdResult.success) {
      throw Errors.fromZod(allocationIdResult.error);
    }

    const bodyResult = ReverseFinanceReceivableAllocationSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableAllocationsService
      .reverseManualAllocation(
        authContext,
        idVerify.data.id,
        allocationIdResult.data.allocationId,
        bodyResult.data,
      );
    return ResponseHandler.success(data);
  }

  @Get("/finance/receivables/:id/events")
  async listReceivableEvents(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const queryResult = FinanceReceivableEventListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await projectReceivableOperationsService.listEvents(
      authContext,
      idVerify.data.id,
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

  @Get("/finance/reports/operating")
  async getOperatingReport(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceOperatingReportQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await financeOperatingReportService.getOperatingReport(
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
