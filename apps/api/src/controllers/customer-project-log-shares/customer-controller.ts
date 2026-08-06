import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { customerCampaignBootstrapService } from "@/services/customer-campaign-bootstrap";
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
import {
  createCustomerProjectDetailTimingSteps,
  logCustomerProjectDetailTiming,
  measureCustomerProjectDetailStep,
} from "@/utils/customer-project-detail-timing";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CustomerProjectLogSharesBaseController } from "./shared";

class CustomerShareCampaignController extends CustomerProjectLogSharesBaseController {
  private isAccessError(error: unknown) {
    return error instanceof AppError &&
      (error.statusCode === 401 || error.statusCode === 403);
  }

  private isAppointmentRewardNotConfigured(error: unknown) {
    return error instanceof AppError &&
      error.code === ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND;
  }

  private buildDisabledShareCampaignSummary(projectId: string) {
    return {
      project_id: projectId,
      campaign_type: "share_assist",
      config_enabled: false,
      display_mode: "disabled",
      config_status: null,
      focus_campaign: null,
      recommended_log: null,
    };
  }

  private buildDisabledAppointmentRewardCampaign(projectId: string) {
    return {
      instance_id: null,
      campaign_id: null,
      campaign_type: "appointment_reward",
      status: "not_configured",
      reward_claim_status: "unclaimed",
      project_id: projectId,
      project_name: null,
      appointment_name: null,
      appointment_phone: null,
      appointment_time: null,
      achieved_at: null,
      reward_claimed_at: null,
      reward_title: null,
      reward_claim_instruction: null,
      display_title: null,
      display_subtitle: null,
      reward_claim_voucher: null,
      config_enabled: false,
      display_mode: "disabled",
    };
  }

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
    const bodyResult = AssistCustomerProjectLogShareCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.assistShareCampaign(
      bodyResult.data,
      {
        authUserId: this.getOptionalAuthUserId(request),
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
    const startedAt = Date.now();
    const steps = createCustomerProjectDetailTimingSteps();
    const authUserId = await measureCustomerProjectDetailStep(
      steps,
      "auth_context_ms",
      () => this.getRequiredAuthUserId(request),
    );
    const paramsResult = CustomerProjectLogShareProjectIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    try {
      const data = await measureCustomerProjectDetailStep(
        steps,
        "campaign_summary_ms",
        async () => {
          const tenantId = request.user?.tenant_id ?? null;
          const hasEntry = await customerCampaignBootstrapService.hasShareAssistEntry({
            projectId: paramsResult.data.projectId,
            tenantId,
          });
          if (hasEntry === false) {
            return this.buildDisabledShareCampaignSummary(paramsResult.data.projectId);
          }
          return customerProjectLogShareService.getCustomerProjectCampaignSummary(
            authUserId,
            paramsResult.data.projectId,
            this.getCustomerProjectScope(request),
          );
        },
      );

      const payload = await measureCustomerProjectDetailStep(
        steps,
        "serialize_ms",
        async () => ({
          ...this.withCampaignType(data),
          focus_campaign: data.focus_campaign
            ? this.withCampaignType(data.focus_campaign)
            : null,
        }),
      );
      logCustomerProjectDetailTiming(request, {
        route: "GET /customer/projects/:id/share-campaigns/summary",
        startedAt,
        tenantId: request.user?.tenant_id ?? null,
        customerId: request.user?.customer_id ?? null,
        projectId: paramsResult.data.projectId,
        steps,
      });
      return ResponseHandler.success(payload);
    } catch (error) {
      if (this.isAccessError(error)) {
        throw error;
      }

      request.log.warn(
        {
          requestId: request.id,
          err: error,
          projectId: paramsResult.data.projectId,
          tenantId: request.user?.tenant_id ?? null,
          customerId: request.user?.customer_id ?? null,
        },
        "[customer-project-detail] share campaign summary degraded",
      );
      const payload = this.withCampaignType(
        this.buildDisabledShareCampaignSummary(paramsResult.data.projectId),
      );
      logCustomerProjectDetailTiming(request, {
        route: "GET /customer/projects/:id/share-campaigns/summary",
        startedAt,
        tenantId: request.user?.tenant_id ?? null,
        customerId: request.user?.customer_id ?? null,
        projectId: paramsResult.data.projectId,
        steps,
      });
      return ResponseHandler.success(payload);
    }
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
    const startedAt = Date.now();
    const steps = createCustomerProjectDetailTimingSteps();
    const authUserId = await measureCustomerProjectDetailStep(
      steps,
      "auth_context_ms",
      () => this.getRequiredAuthUserId(request),
    );
    const paramsResult = CustomerAppointmentRewardProjectIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    try {
      const data = await measureCustomerProjectDetailStep(
        steps,
        "appointment_reward_ms",
        async () => {
          const tenantId = request.user?.tenant_id ?? null;
          const hasEntry =
            await customerCampaignBootstrapService.hasAppointmentRewardEntry({
              projectId: paramsResult.data.projectId,
              tenantId,
            });
          if (hasEntry === false) {
            return this.buildDisabledAppointmentRewardCampaign(paramsResult.data.projectId);
          }
          return customerProjectLogShareService.getCustomerAppointmentRewardCampaign(
            authUserId,
            paramsResult.data.projectId,
            this.getCustomerProjectScope(request),
          );
        },
      );

      const voucherToken = data.reward_claim_voucher?.voucher_token;

      const payload = await measureCustomerProjectDetailStep(
        steps,
        "serialize_ms",
        async () => this.withCampaignType({
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
        }),
      );
      logCustomerProjectDetailTiming(request, {
        route: "GET /customer/projects/:id/appointment-reward-campaign",
        startedAt,
        tenantId: request.user?.tenant_id ?? null,
        customerId: request.user?.customer_id ?? null,
        projectId: paramsResult.data.projectId,
        steps,
      });
      return ResponseHandler.success(payload);
    } catch (error) {
      if (this.isAccessError(error)) {
        throw error;
      }

      if (!this.isAppointmentRewardNotConfigured(error)) {
        request.log.warn(
          {
            requestId: request.id,
            err: error,
            projectId: paramsResult.data.projectId,
            tenantId: request.user?.tenant_id ?? null,
            customerId: request.user?.customer_id ?? null,
          },
          "[customer-project-detail] appointment reward campaign degraded",
        );
      }
      const payload = this.withCampaignType(
        this.buildDisabledAppointmentRewardCampaign(paramsResult.data.projectId),
      );
      logCustomerProjectDetailTiming(request, {
        route: "GET /customer/projects/:id/appointment-reward-campaign",
        startedAt,
        tenantId: request.user?.tenant_id ?? null,
        customerId: request.user?.customer_id ?? null,
        projectId: paramsResult.data.projectId,
        steps,
      });
      return ResponseHandler.success(payload);
    }
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
