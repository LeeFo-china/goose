import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  FinanceLedgerListQuerySchema,
  FinanceProjectSummaryListQuerySchema,
} from "@/schema/finance";
import { FinanceReceivableListQuerySchema } from "@/schema/finance-receivables";
import { financeLedgerService } from "@/services/finance-ledger";
import { financeProjectSummaryService } from "@/services/finance-project-summary";
import { projectReceivablesService } from "@/services/project-receivables";
import { Get } from "@/utils/decorators/route";
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
