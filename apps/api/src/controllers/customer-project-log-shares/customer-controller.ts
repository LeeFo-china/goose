import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import {
  AssistCustomerProjectLogShareCampaignSchema,
  ClaimCustomerProjectLogShareCampaignSchema,
  ClaimCustomerProjectLogShareVoucherSchema,
  CreateCustomerProjectLogShareCampaignSchema,
  CreateCustomerProjectLogShareRecordSchema,
  CustomerProjectLogShareCampaignIdParamsSchema,
  CustomerProjectLogShareHelpersQuerySchema,
  CustomerProjectLogShareProjectIdParamsSchema,
  CustomerProjectLogShareTokenParamsSchema,
  CustomerProjectLogShareVoucherTokenParamsSchema,
  CustomerProjectLogShareParamsSchema,
  GenerateCustomerProjectLogShareCopySchema,
  GetCustomerProjectLogShareCardQuerySchema,
  OpenCustomerProjectLogShareCampaignSchema,
} from "@/schema/customer-project-log-share";
import {
  CustomerAppointmentRewardProjectIdParamsSchema,
  CustomerAppointmentRewardSubmitSchema,
  EmployeeAppointmentRewardArriveSchema,
  EmployeeAppointmentRewardClaimSchema,
} from "@/schema/appointment-reward";
import { customerProjectLogShareService } from "@/services/customer-project-log-shares";
import {
  CreateMarketingCampaignSchema,
  CreateMarketingCampaignTemplateSchema,
  MarketingCampaignIdParamsSchema,
  MarketingCampaignInstanceIdParamsSchema,
  MarketingCampaignInstanceListQuerySchema,
  MarketingCampaignListQuerySchema,
  MarketingCampaignStatusUpdateSchema,
  MarketingCampaignTemplateIdParamsSchema,
  MarketingCampaignTemplateListQuerySchema,
  MarketingCampaignTemplateStatusUpdateSchema,
  UpdateMarketingCampaignSchema,
  UpdateMarketingCampaignTemplateSchema,
} from "@/schema/marketing-center-campaign";
import {
  EmployeeProjectShareCampaignConfigParamsSchema,
  EmployeeShareCampaignListQuerySchema,
  EmployeeShareCampaignStatsSummaryQuerySchema,
  PostEmployeeShareCampaignStatusSchema,
  PostProjectShareCampaignConfigStatusSchema,
  PutProjectShareCampaignConfigSchema,
  ShareCampaignManagementCampaignIdParamsSchema,
} from "@/schema/share-campaign-management";
import { Post, Get } from "@/utils/decorators/route";
import { Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CustomerProjectLogSharesBaseController } from "./shared";

class CustomerShareCampaignController extends CustomerProjectLogSharesBaseController {
  @Post("/customer/projects/:projectId/logs/:logId/share-copy")
  async generateShareCopy(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = GenerateCustomerProjectLogShareCopySchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.generateShareCopies(
      authUserId,
      paramsResult.data.projectId,
      paramsResult.data.logId,
      bodyResult.data,
    );

    return ResponseHandler.success(data);
  }

  @Get("/customer/projects/:projectId/logs/:logId/share-card")
  async getShareCard(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = GetCustomerProjectLogShareCardQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerProjectLogShareService.getShareCard(
      authUserId,
      paramsResult.data.projectId,
      paramsResult.data.logId,
      queryResult.data,
    );

    const shareToken = typeof data.share_token === "string" ? data.share_token : "";

    return ResponseHandler.success({
      ...data,
      share_qrcode_url: shareToken
        ? this.buildAbsoluteUrl(request, `/share-campaigns/${encodeURIComponent(shareToken)}/qrcode`)
        : null,
    });
  }

  @Post("/customer/projects/:projectId/logs/:logId/share-campaign")
  async createOrGetShareCampaign(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = CreateCustomerProjectLogShareCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.getOrCreateShareCampaign(
      authUserId,
      paramsResult.data.projectId,
      paramsResult.data.logId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/customer/projects/:projectId/logs/:logId/share-record")
  async createShareRecord(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = CreateCustomerProjectLogShareRecordSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.createShareRecord(
      authUserId,
      paramsResult.data.projectId,
      paramsResult.data.logId,
      bodyResult.data,
    );

    return ResponseHandler.success(data);
  }

  @Post("/share-campaigns/open")
  async openShareCampaign(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = OpenCustomerProjectLogShareCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.openShareCampaign(
      bodyResult.data,
      {
        authUserId: this.getOptionalAuthUserId(request),
        openid: request.user?.openid ?? null,
        ip: request.ip,
      },
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/share-campaigns/assist")
  async assistShareCampaign(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const bodyResult = AssistCustomerProjectLogShareCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.assistShareCampaign(
      bodyResult.data,
      {
        authUserId,
        openid: request.user?.openid ?? null,
        ip: request.ip,
      },
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/share-campaigns/:shareToken")
  async getShareCampaignDetail(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = CustomerProjectLogShareTokenParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getShareCampaignDetail(
      paramsResult.data.shareToken,
      {
        authUserId: this.getOptionalAuthUserId(request),
        openid: request.user?.openid ?? null,
      },
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/share-campaigns/:shareToken/qrcode")
  async getShareCampaignQrcode(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = CustomerProjectLogShareTokenParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const buffer = await customerProjectLogShareService.getShareCampaignQrcodeBuffer(
      paramsResult.data.shareToken,
    );

    reply.header("Content-Type", "image/png");
    reply.header("Cache-Control", "public, max-age=300");
    return reply.send(buffer);
  }

  @Get("/share-campaign-claim-vouchers/:voucherToken/qrcode")
  async getRewardClaimVoucherQrcode(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = CustomerProjectLogShareVoucherTokenParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const buffer = await customerProjectLogShareService.getRewardClaimVoucherQrcodeBuffer(
      paramsResult.data.voucherToken,
    );

    reply.header("Content-Type", "image/png");
    reply.header("Cache-Control", "public, max-age=300");
    return reply.send(buffer);
  }

  @Get("/appointment-reward-claim-vouchers/:voucherToken/qrcode")
  async getAppointmentRewardClaimVoucherQrcode(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = CustomerProjectLogShareVoucherTokenParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const buffer = await customerProjectLogShareService.getAppointmentRewardClaimVoucherQrcodeBuffer(
      paramsResult.data.voucherToken,
    );

    reply.header("Content-Type", "image/png");
    reply.header("Cache-Control", "public, max-age=300");
    return reply.send(buffer);
  }

  @Get("/customer/projects/:projectId/share-campaigns/summary")
  async getCustomerProjectCampaignSummary(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareProjectIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getCustomerProjectCampaignSummary(
      authUserId,
      paramsResult.data.projectId,
      this.getCustomerProjectScope(request),
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      focus_campaign: data.focus_campaign
        ? this.withCampaignType(data.focus_campaign)
        : null,
    });
  }

  @Post("/customer/projects/:projectId/appointment-reward-campaign")
  async createOrGetCustomerAppointmentRewardCampaign(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerAppointmentRewardProjectIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getOrCreateCustomerAppointmentRewardCampaign(
      authUserId,
      paramsResult.data.projectId,
      this.getCustomerProjectScope(request),
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/customer/projects/:projectId/appointment-reward-campaign")
  async getCustomerAppointmentRewardCampaign(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerAppointmentRewardProjectIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getCustomerAppointmentRewardCampaign(
      authUserId,
      paramsResult.data.projectId,
      this.getCustomerProjectScope(request),
    );

    const voucherToken = data.reward_claim_voucher?.voucher_token;

    return ResponseHandler.success(this.withCampaignType({
      ...data,
      reward_claim_voucher: data.reward_claim_voucher
        ? {
          ...data.reward_claim_voucher,
          qrcode_url: voucherToken
            ? this.buildAbsoluteUrl(
              request,
              `/appointment-reward-claim-vouchers/${encodeURIComponent(voucherToken)}/qrcode`,
            )
            : null,
        }
        : null,
    }));
  }

  @Post("/customer/projects/:projectId/appointment-reward-campaign/submit")
  async submitCustomerAppointmentRewardCampaign(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerAppointmentRewardProjectIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = CustomerAppointmentRewardSubmitSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.submitCustomerAppointmentRewardCampaign(
      authUserId,
      paramsResult.data.projectId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

}

export default new CustomerShareCampaignController();
