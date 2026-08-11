import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
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

class MarketingCenterCampaignInstanceController extends CustomerProjectLogSharesBaseController {
  @Get("/employee/marketing-center/campaigns/:campaignId/instances")
  async listMarketingCenterCampaignInstances(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantAuthContext(request);
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
    const authContext = await this.getRequiredTenantAuthContext(request);
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

    const data = campaign.campaign_type === "appointment_reward"
      ? await customerProjectLogShareService.getEmployeeAppointmentRewardCampaignDetail(
        paramsResult.data.instanceId,
      )
      : await customerProjectLogShareService.getEmployeeShareCampaignDetail(
        paramsResult.data.instanceId,
      );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Get("/employee/marketing-center/campaign-instances/:instanceId/helpers")
  async listMarketingCenterCampaignInstanceHelpers(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantAuthContext(request);
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

    const data = campaign.campaign_type === "appointment_reward"
      ? {
        list: [],
        pagination: {
          page: queryResult.data.page,
          pageSize: queryResult.data.pageSize,
          total: 0,
          totalPages: 0,
        },
      }
      : await customerProjectLogShareService.listEmployeeShareCampaignHelpers(
        paramsResult.data.instanceId,
        queryResult.data.page,
        queryResult.data.pageSize,
      );

    return ResponseHandler.success({
      ...this.withCampaignType(data),
      list: this.withCampaignTypeList(data.list),
    });
  }

  @Post("/employee/marketing-center/campaign-instances/:instanceId/arrive")
  async arriveMarketingCenterCampaignInstance(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantAuthContext(request);
    const paramsResult = MarketingCampaignInstanceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = EmployeeAppointmentRewardArriveSchema.safeParse(request.body);
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

    if (campaign.campaign_type !== "appointment_reward") {
      throw Errors.badRequest("当前活动类型不支持确认到店");
    }

    const data = await customerProjectLogShareService.confirmEmployeeAppointmentRewardArrive(
      paramsResult.data.instanceId,
    );

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/marketing-center/campaign-instances/:instanceId/claim")
  async claimMarketingCenterCampaignInstanceReward(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantAuthContext(request);
    const paramsResult = MarketingCampaignInstanceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

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

    const data = campaign.campaign_type === "appointment_reward"
      ? await (() => {
        const bodyResult = EmployeeAppointmentRewardClaimSchema.safeParse(request.body);
        if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
        return customerProjectLogShareService.claimEmployeeAppointmentReward(
          paramsResult.data.instanceId,
          authContext.employeeId!,
          bodyResult.data,
        );
      })()
      : await (() => {
        const bodyResult = ClaimCustomerProjectLogShareCampaignSchema.safeParse(request.body);
        if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
        return customerProjectLogShareService.claimCampaignReward(
          paramsResult.data.instanceId,
          authContext.employeeId!,
          bodyResult.data,
        );
      })();

    return ResponseHandler.success(this.withCampaignType(data));
  }

  @Post("/employee/share-campaigns/:campaignId/claim")
  async claimCampaignReward(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantAuthContext(request);
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
    const authContext = await this.getRequiredTenantAuthContext(request);
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
    const authContext = await this.getRequiredTenantAuthContext(request);
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

export default new MarketingCenterCampaignInstanceController();
