import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  FinanceCostCategorySummaryQuerySchema,
  FinanceMonthlyOverviewDifferenceSourcesQuerySchema,
  FinanceMonthlyOverviewExportQuerySchema,
  FinanceProjectRankingQuerySchema,
  FinanceReceivableAgingQuerySchema,
  UpdateFinanceMonthlyDifferenceResolutionSchema,
} from "@/schema/finance-reports";
import {
  financeMonthlyDifferenceSourcesService,
} from "@/services/finance-monthly-difference-sources";
import {
  financeSpecializedReportService,
} from "@/services/finance-specialized-reports";
import { Get, Put, registerRoutes } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

class FinanceReportsController extends TenantBaseController {
  constructor() {
    super("finance-reports");
  }

  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    registerRoutes(fastify, this);
  };

  @Get("/finance/reports/monthly-overview/export")
  async exportMonthlyOverview(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceMonthlyOverviewExportQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await financeSpecializedReportService.exportMonthlyOverviewCsv(
      authContext,
      queryResult.data,
    );
    return reply
      .header("content-type", data.content_type)
      .header(
        "content-disposition",
        `attachment; filename="${data.filename}"`,
      )
      .send(data.content);
  }

  @Get("/finance/reports/monthly-overview/difference-sources")
  async listMonthlyOverviewDifferenceSources(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult =
      FinanceMonthlyOverviewDifferenceSourcesQuerySchema.safeParse(
        request.query,
      );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await financeMonthlyDifferenceSourcesService
      .listDifferenceSources(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Put("/finance/reports/monthly-overview/difference-resolutions")
  async updateMonthlyOverviewDifferenceResolution(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = UpdateFinanceMonthlyDifferenceResolutionSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await financeMonthlyDifferenceSourcesService
      .updateResolution(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/finance/reports/project-ranking")
  async getProjectRanking(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceProjectRankingQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await financeSpecializedReportService.getProjectRanking(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/reports/cost-category-summary")
  async getCostCategorySummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceCostCategorySummaryQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await financeSpecializedReportService.getCostCategorySummary(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/reports/receivable-aging")
  async getReceivableAging(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceReceivableAgingQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await financeSpecializedReportService.getReceivableAging(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new FinanceReportsController();
