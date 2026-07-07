import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  PartnerDashboardCommissionLedgerListQuerySchema,
  PartnerDashboardRevenueEventListQuerySchema,
  PartnerDashboardSettlementListQuerySchema,
  PartnerDashboardSummaryQuerySchema,
  PartnerDashboardTenantListQuerySchema,
  PartnerAuthBindPhoneSchema,
  PartnerAuthLoginSchema,
  PartnerAuthSendCodeSchema,
  PartnerAuthUnbindWechatSchema,
} from "@/schema/platform-partner-portal";
import {
  CreatePlatformPartnerMemberRebindRequestSchema,
  PlatformPartnerMemberRebindSendCodeSchema,
} from "@/schema/platform-partner-member-rebind";
import { platformPartnerMemberRebindService } from "@/services/platform-partner-member-rebind";
import { platformPartnerPortalService } from "@/services/platform-partner-portal";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class PlatformPartnerPortalController extends BaseController {
  constructor() {
    super("platform-partner-portal");
  }

  @Post("/partner/auth/login")
  async login(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthLoginSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerPortalService.login({
      ...bodyResult.data,
      request,
    });
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/send-code")
  async sendCode(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthSendCodeSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerPortalService.sendCode({
      ...bodyResult.data,
      requestIp: request.ip ?? null,
    });
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/bind-phone")
  async bindPhone(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthBindPhoneSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerPortalService.bindPhone({
      ...bodyResult.data,
      request,
    });
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/rebind-code")
  async sendRebindCode(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PlatformPartnerMemberRebindSendCodeSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerMemberRebindService.sendRebindCode({
      ...bodyResult.data,
      requestIp: request.ip ?? null,
      requestDevice: getRequestDevice(request),
    });
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/rebind-requests")
  async createRebindRequest(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult =
      CreatePlatformPartnerMemberRebindRequestSchema.safeParse(
        request.body || {},
      );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerMemberRebindService.createRequest(
      request.user,
      bodyResult.data,
      request,
    );
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/unbind-code")
  async sendUnbindCode(request: FastifyRequest, reply: FastifyReply) {
    const data = await platformPartnerPortalService.sendUnbindCode(
      request.user,
      request.ip ?? null,
    );
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/unbind-wechat")
  async unbindWechat(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthUnbindWechatSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerPortalService.unbindWechat(
      request.user,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/partner/auth/me")
  async me(request: FastifyRequest, reply: FastifyReply) {
    const data = await platformPartnerPortalService.me(request.user);
    return ResponseHandler.success(data);
  }

  @Get("/partner/dashboard/summary")
  async summary(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = PartnerDashboardSummaryQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerPortalService.summary(
      request.user,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/partner/invite-codes")
  async inviteCodes(request: FastifyRequest, reply: FastifyReply) {
    const data = await platformPartnerPortalService.listInviteCodes(request.user);
    return ResponseHandler.success(data);
  }

  @Get("/partner/invite-code/default")
  async defaultInviteCode(request: FastifyRequest, reply: FastifyReply) {
    const data = await platformPartnerPortalService.getDefaultInviteCode(
      request.user,
    );
    return ResponseHandler.success(data);
  }

  @Get("/partner/dashboard/tenants")
  async tenants(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = PartnerDashboardTenantListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerPortalService.listTenants(
      request.user,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/partner/dashboard/revenue-events")
  async revenueEvents(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = PartnerDashboardRevenueEventListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerPortalService.listRevenueEvents(
      request.user,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/partner/dashboard/commission-ledger")
  async commissionLedger(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = PartnerDashboardCommissionLedgerListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerPortalService.listCommissionLedger(
      request.user,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/partner/dashboard/settlements")
  async settlements(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = PartnerDashboardSettlementListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformPartnerPortalService.listSettlements(
      request.user,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }
}

function getRequestDevice(request: FastifyRequest) {
  const headerNames = [
    "x-device-id",
    "x-visitor-device-id",
    "x-client-device-id",
    "x-client-id",
  ];

  for (const headerName of headerNames) {
    const rawValue = request.headers[headerName];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized.slice(0, 160);
  }

  return null;
}

export default new PlatformPartnerPortalController();
