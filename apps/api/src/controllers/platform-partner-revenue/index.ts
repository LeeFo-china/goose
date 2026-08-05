import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  LeadServiceFeeRevenueCreateSchema,
  PartnerCommissionLedgerListQuerySchema,
  PartnerSettlementBatchCreateSchema,
  PartnerSettlementBatchListQuerySchema,
  PartnerSettlementBatchMarkPaidSchema,
  PartnerSettlementBatchParamSchema,
  PlatformRevenueEventListQuerySchema,
  RechargeRevenueSyncSchema,
} from "@/schema/platform-partner-revenue";
import { platformPartnerRevenueService } from "@/services/platform-partner-revenue";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformPartnerRevenueController extends PlatformBaseController {
  constructor() {
    super("platform-partner-revenue");
  }

  @Get("/platform/partner-revenue/events")
  async listRevenueEvents(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRevenueReadContext(request);
    const queryResult = PlatformRevenueEventListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerRevenueService.listRevenueEvents(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partner-revenue/lead-service-fees")
  async createLeadServiceFeeRevenue(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRevenueManageContext(request);
    const bodyResult = LeadServiceFeeRevenueCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerRevenueService
      .createLeadServiceFeeRevenue(
        authContext,
        bodyResult.data,
      );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partner-revenue/recharge-events/sync")
  async syncRechargeRevenueEvents(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRevenueManageContext(request);
    const bodyResult = RechargeRevenueSyncSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerRevenueService.syncRechargeRevenueEvents(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/partner-commissions")
  async listCommissionLedgers(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getCommissionReadContext(request);
    const queryResult = PartnerCommissionLedgerListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerRevenueService.listCommissionLedgers(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/partner-settlements")
  async listSettlementBatches(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getCommissionReadContext(request);
    const queryResult = PartnerSettlementBatchListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerRevenueService.listSettlementBatches(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partner-settlements/monthly-batches")
  async createMonthlySettlementBatch(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getSettlementManageContext(request);
    const bodyResult = PartnerSettlementBatchCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerRevenueService
      .createMonthlySettlementBatch(
        authContext,
        bodyResult.data,
      );
    return ResponseHandler.success(data);
  }

  @Post("/platform/partner-settlements/:id/mark-paid")
  async markSettlementPaid(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getSettlementManageContext(request);
    const paramsResult = PartnerSettlementBatchParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PartnerSettlementBatchMarkPaidSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerRevenueService.markSettlementPaid(
      authContext,
      {
        batchId: paramsResult.data.id,
        ...bodyResult.data,
      },
    );
    return ResponseHandler.success(data);
  }

  private getRevenueReadContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.partner.revenue.read");
  }

  private getRevenueManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.partner.revenue.manage");
  }

  private getCommissionReadContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.partner.commission.read");
  }

  private getSettlementManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.partner.settlement.manage");
  }
}

export default new PlatformPartnerRevenueController();
