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

class EmployeeShareCampaignController extends CustomerProjectLogSharesBaseController {
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
      list: this.withCampaignTypeList(data.list as Array<Record<string, unknown>>),
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

  @Get("/employee/marketing-center/templates")
  async listMarketingCenterTemplates(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.read");
    const queryResult = MarketingCampaignTemplateListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerProjectLogShareService.listMarketingCampaignTemplates(
      queryResult.data,
    );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      list: this.withCampaignTypeList(data.list),
    });
  }

  @Post("/employee/marketing-center/templates")
  async createMarketingCenterTemplate(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.update");
    const bodyResult = CreateMarketingCampaignTemplateSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.createMarketingCampaignTemplate(
      authContext,
      bodyResult.data,
    );

    return ResponseHandler.success(data);
  }

  @Get("/employee/marketing-center/templates/:templateId")
  async getMarketingCenterTemplateDetail(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.read");
    const paramsResult = MarketingCampaignTemplateIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await customerProjectLogShareService.getMarketingCampaignTemplateDetail(
      paramsResult.data.templateId,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Put("/employee/marketing-center/templates/:templateId")
  async updateMarketingCenterTemplate(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.update");
    const paramsResult = MarketingCampaignTemplateIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateMarketingCampaignTemplateSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.updateMarketingCampaignTemplate(
      authContext,
      paramsResult.data.templateId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/marketing-center/templates/:templateId/status")
  async updateMarketingCenterTemplateStatus(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "project.update");
    const paramsResult = MarketingCampaignTemplateIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = MarketingCampaignTemplateStatusUpdateSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerProjectLogShareService.updateMarketingCampaignTemplateStatus(
      authContext,
      paramsResult.data.templateId,
      bodyResult.data,
    );

    return ResponseHandler.success(this.withCampaignType(data));
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

}

export default new EmployeeShareCampaignController();
