import { BaseController } from "@/controllers/BaseController";
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
import { customerProjectLogShareService } from "@/services/customer-project-log-shares";
import {
  CreateMarketingCampaignSchema,
  MarketingCampaignIdParamsSchema,
  MarketingCampaignInstanceIdParamsSchema,
  MarketingCampaignInstanceListQuerySchema,
  MarketingCampaignListQuerySchema,
  MarketingCampaignStatusUpdateSchema,
  UpdateMarketingCampaignSchema,
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

class CustomerProjectLogSharesController extends BaseController {
  private readonly marketingCampaignType = "share_assist" as const;

  constructor() {
    super("customer-project-log-shares");
  }

  private getRequiredAuthUserId(request: FastifyRequest) {
    const authUserId = request.user?.sub;
    if (!authUserId) {
      throw Errors.unauthorized();
    }

    return authUserId;
  }

  private getOptionalAuthUserId(request: FastifyRequest) {
    return request.user?.sub;
  }

  private buildAbsoluteUrl(request: FastifyRequest, path: string) {
    const proto = (request.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim()
      || request.protocol
      || "https";
    const host = request.headers["x-forwarded-host"] as string | undefined
      || request.headers.host
      || "sock.goodcms.cn";

    return `${proto}://${host}${path}`;
  }

  private withCampaignType<T extends Record<string, unknown>>(data: T) {
    return {
      ...data,
      campaign_type: this.marketingCampaignType,
    };
  }

  private withCampaignTypeList<T extends Record<string, unknown>>(list: T[]) {
    return list.map((item) => this.withCampaignType(item));
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

  @Get("/customer/projects/:projectId/share-campaigns/summary")
  async getCustomerProjectCampaignSummary(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareProjectIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getCustomerProjectCampaignSummary(
      authUserId,
      paramsResult.data.projectId,
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      focus_campaign: data.focus_campaign
        ? this.withCampaignType(data.focus_campaign)
        : null,
    });
  }

  @Get("/employee/projects/:projectId/share-campaign-config")
  async getEmployeeProjectShareCampaignConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = EmployeeProjectShareCampaignConfigParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      paramsResult.data.projectId,
      "project.read",
    );
    if (!hasAccess) throw Errors.forbidden();

    const data = await customerProjectLogShareService.getEmployeeProjectCampaignConfig(
      paramsResult.data.projectId,
    );
    return ResponseHandler.success({
      ...this.withCampaignType(data),
      config: data.config ? this.withCampaignType(data.config) : null,
    });
  }

  @Put("/employee/projects/:projectId/share-campaign-config")
  async putEmployeeProjectShareCampaignConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = EmployeeProjectShareCampaignConfigParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PutProjectShareCampaignConfigSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      paramsResult.data.projectId,
      "project.update",
    );
    if (!hasAccess) throw Errors.forbidden();

    const data = await customerProjectLogShareService.saveEmployeeProjectCampaignConfig(
      paramsResult.data.projectId,
      authContext.employeeId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/projects/:projectId/share-campaign-config/status")
  async postEmployeeProjectShareCampaignConfigStatus(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = EmployeeProjectShareCampaignConfigParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PostProjectShareCampaignConfigStatusSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      paramsResult.data.projectId,
      "project.update",
    );
    if (!hasAccess) throw Errors.forbidden();

    const data = await customerProjectLogShareService.updateEmployeeProjectCampaignConfigStatus(
      paramsResult.data.projectId,
      authContext.employeeId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/employee/marketing-center/projects/:projectId/share-assist-config")
  async getMarketingCenterProjectShareAssistConfig(request: FastifyRequest, reply: FastifyReply) {
    return this.getEmployeeProjectShareCampaignConfig(request, reply);
  }

  @Put("/employee/marketing-center/projects/:projectId/share-assist-config")
  async putMarketingCenterProjectShareAssistConfig(request: FastifyRequest, reply: FastifyReply) {
    return this.putEmployeeProjectShareCampaignConfig(request, reply);
  }

  @Post("/employee/marketing-center/projects/:projectId/share-assist-config/status")
  async postMarketingCenterProjectShareAssistConfigStatus(request: FastifyRequest, reply: FastifyReply) {
    return this.postEmployeeProjectShareCampaignConfigStatus(request, reply);
  }

  @Get("/customer/share-campaigns/:campaignId")
  async getCustomerCampaignDetail(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getCustomerCampaignDetail(
      authUserId,
      paramsResult.data.campaignId,
    );

    const voucherToken = data.reward_claim_voucher?.voucher_token;

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      reward_claim_voucher: data.reward_claim_voucher
        ? {
          ...data.reward_claim_voucher,
          qrcode_url: voucherToken
            ? this.buildAbsoluteUrl(
              request,
              `/share-campaign-claim-vouchers/${encodeURIComponent(voucherToken)}/qrcode`,
            )
            : null,
        }
        : null,
    });
  }

  @Get("/customer/share-campaigns/:campaignId/helpers")
  async listCustomerCampaignHelpers(request: FastifyRequest, reply: FastifyReply) {
    const authUserId = this.getRequiredAuthUserId(request);
    const paramsResult = CustomerProjectLogShareCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = CustomerProjectLogShareHelpersQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerProjectLogShareService.listCustomerCampaignHelpers(
      authUserId,
      paramsResult.data.campaignId,
      queryResult.data.page,
      queryResult.data.pageSize,
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      list: this.withCampaignTypeList(data.list),
    });
  }

  @Get("/employee/share-campaigns")
  async listEmployeeShareCampaigns(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.read");
    const queryResult = EmployeeShareCampaignListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerProjectLogShareService.listEmployeeShareCampaigns(
      authContext,
      queryResult.data,
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      list: this.withCampaignTypeList(data.list),
    });
  }

  @Get("/employee/marketing-center/campaigns")
  async listMarketingCenterCampaigns(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.read");
    const queryResult = MarketingCampaignListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerProjectLogShareService.listMarketingCampaigns(
      authContext,
      queryResult.data,
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      list: this.withCampaignTypeList(data.list),
    });
  }

  @Post("/employee/marketing-center/campaigns")
  async createMarketingCenterCampaign(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.update");
    const bodyResult = CreateMarketingCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.createMarketingCampaign(
      authContext,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/employee/share-campaigns/stats/summary")
  async getEmployeeShareCampaignStatsSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.read");
    const queryResult = EmployeeShareCampaignStatsSummaryQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerProjectLogShareService.getEmployeeShareCampaignStatsSummary(
      authContext,
      queryResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/employee/marketing-center/campaigns/stats/summary")
  async getMarketingCenterCampaignStatsSummary(request: FastifyRequest, reply: FastifyReply) {
    return this.getEmployeeShareCampaignStatsSummary(request, reply);
  }

  @Get("/employee/share-campaigns/:campaignId")
  async getEmployeeShareCampaignDetail(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = ShareCampaignManagementCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const campaign = await customerProjectLogShareService.getCampaignMetaForEmployeeClaim(
      paramsResult.data.campaignId,
    );
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      campaign.project_id,
      "project.read",
    );
    if (!hasAccess) throw Errors.forbidden();

    const data = await customerProjectLogShareService.getEmployeeShareCampaignDetail(
      paramsResult.data.campaignId,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/employee/marketing-center/campaigns/:campaignId")
  async getMarketingCenterCampaignDetail(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.read");
    const paramsResult = MarketingCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getMarketingCampaignDetail(
      authContext,
      paramsResult.data.campaignId,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Put("/employee/marketing-center/campaigns/:campaignId")
  async updateMarketingCenterCampaign(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.update");
    const paramsResult = MarketingCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateMarketingCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.updateMarketingCampaign(
      authContext,
      paramsResult.data.campaignId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/share-campaigns/:campaignId/status")
  async postEmployeeShareCampaignStatus(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = ShareCampaignManagementCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PostEmployeeShareCampaignStatusSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const campaign = await customerProjectLogShareService.getCampaignMetaForEmployeeClaim(
      paramsResult.data.campaignId,
    );
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      campaign.project_id,
      "project.update",
    );
    if (!hasAccess) throw Errors.forbidden();

    const data = await customerProjectLogShareService.updateEmployeeShareCampaignStatus(
      paramsResult.data.campaignId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/marketing-center/campaigns/:campaignId/status")
  async postMarketingCenterCampaignStatus(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.update");
    const paramsResult = MarketingCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = MarketingCampaignStatusUpdateSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.updateMarketingCampaignStatus(
      authContext,
      paramsResult.data.campaignId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/employee/share-campaigns/:campaignId/helpers")
  async listEmployeeShareCampaignHelpers(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = ShareCampaignManagementCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = CustomerProjectLogShareHelpersQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const campaign = await customerProjectLogShareService.getCampaignMetaForEmployeeClaim(
      paramsResult.data.campaignId,
    );
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      campaign.project_id,
      "project.read",
    );
    if (!hasAccess) throw Errors.forbidden();

    const data = await customerProjectLogShareService.listEmployeeShareCampaignHelpers(
      paramsResult.data.campaignId,
      queryResult.data.page,
      queryResult.data.pageSize,
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      list: this.withCampaignTypeList(data.list),
    });
  }

  @Get("/employee/marketing-center/campaigns/:campaignId/helpers")
  async listMarketingCenterCampaignHelpers(request: FastifyRequest, reply: FastifyReply) {
    return this.listEmployeeShareCampaignHelpers(request, reply);
  }

  @Get("/employee/marketing-center/campaigns/:campaignId/instances")
  async listMarketingCenterCampaignInstances(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.read");
    const paramsResult = MarketingCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = MarketingCampaignInstanceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerProjectLogShareService.listMarketingCampaignInstances(
      authContext,
      paramsResult.data.campaignId,
      queryResult.data,
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      list: this.withCampaignTypeList(data.list),
    });
  }

  @Get("/employee/marketing-center/campaign-instances/:instanceId")
  async getMarketingCenterCampaignInstanceDetail(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = MarketingCampaignInstanceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const campaign = await customerProjectLogShareService.getCampaignMetaForEmployeeClaim(
      paramsResult.data.instanceId,
    );
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      campaign.project_id,
      "project.read",
    );
    if (!hasAccess) throw Errors.forbidden();

    const data = await customerProjectLogShareService.getEmployeeShareCampaignDetail(
      paramsResult.data.instanceId,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/employee/marketing-center/campaign-instances/:instanceId/helpers")
  async listMarketingCenterCampaignInstanceHelpers(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = MarketingCampaignInstanceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = CustomerProjectLogShareHelpersQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const campaign = await customerProjectLogShareService.getCampaignMetaForEmployeeClaim(
      paramsResult.data.instanceId,
    );
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      campaign.project_id,
      "project.read",
    );
    if (!hasAccess) throw Errors.forbidden();

    const data = await customerProjectLogShareService.listEmployeeShareCampaignHelpers(
      paramsResult.data.instanceId,
      queryResult.data.page,
      queryResult.data.pageSize,
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      list: this.withCampaignTypeList(data.list),
    });
  }

  @Post("/employee/marketing-center/campaign-instances/:instanceId/claim")
  async claimMarketingCenterCampaignInstanceReward(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = MarketingCampaignInstanceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ClaimCustomerProjectLogShareCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const campaign = await customerProjectLogShareService.getCampaignMetaForEmployeeClaim(
      paramsResult.data.instanceId,
    );

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      campaign.project_id,
      "project.update",
    );
    if (!hasAccess || !authContext.employeeId) {
      throw Errors.forbidden();
    }

    const data = await customerProjectLogShareService.claimCampaignReward(
      paramsResult.data.instanceId,
      authContext.employeeId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/share-campaigns/:campaignId/claim")
  async claimCampaignReward(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = CustomerProjectLogShareCampaignIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ClaimCustomerProjectLogShareCampaignSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const campaign = await customerProjectLogShareService.getCampaignMetaForEmployeeClaim(
      paramsResult.data.campaignId,
    );

    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      campaign.project_id,
      "project.update",
    );
    if (!hasAccess || !authContext.employeeId) {
      throw Errors.forbidden();
    }

    const data = await customerProjectLogShareService.claimCampaignReward(
      paramsResult.data.campaignId,
      authContext.employeeId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/marketing-center/campaigns/:campaignId/claim")
  async claimMarketingCenterCampaignReward(request: FastifyRequest, reply: FastifyReply) {
    return this.claimCampaignReward(request, reply);
  }

  @Get("/employee/share-campaign-claim-vouchers/:voucherToken")
  async getEmployeeRewardClaimVoucherDetail(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = CustomerProjectLogShareVoucherTokenParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const voucher = await customerProjectLogShareService.getVoucherMetaForEmployeeClaim(
      paramsResult.data.voucherToken,
    );
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      voucher.project_id,
      "project.update",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    const data = await customerProjectLogShareService.getEmployeeVoucherDetail(
      paramsResult.data.voucherToken,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/employee/marketing-center/claim-vouchers/:voucherToken")
  async getMarketingCenterRewardClaimVoucherDetail(request: FastifyRequest, reply: FastifyReply) {
    return this.getEmployeeRewardClaimVoucherDetail(request, reply);
  }

  @Post("/employee/share-campaign-claim-vouchers/:voucherToken/claim")
  async claimRewardByVoucher(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = CustomerProjectLogShareVoucherTokenParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ClaimCustomerProjectLogShareVoucherSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const voucher = await customerProjectLogShareService.getVoucherMetaForEmployeeClaim(
      paramsResult.data.voucherToken,
    );
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      voucher.project_id,
      "project.update",
    );
    if (!hasAccess || !authContext.employeeId) {
      throw Errors.forbidden();
    }

    const data = await customerProjectLogShareService.claimCampaignRewardByVoucher(
      paramsResult.data.voucherToken,
      authContext.employeeId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/marketing-center/claim-vouchers/:voucherToken/claim")
  async claimMarketingCenterRewardByVoucher(request: FastifyRequest, reply: FastifyReply) {
    return this.claimRewardByVoucher(request, reply);
  }
}

export default new CustomerProjectLogSharesController();
