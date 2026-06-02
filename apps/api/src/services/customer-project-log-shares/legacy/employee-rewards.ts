import { randomUUID } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import { aiGateway } from "@/services/ai-gateway";
import type { AuthContext } from "@/services/authorization";
import { projectMemberService } from "@/services/project-members";
import { systemSettingsService } from "@/services/system-settings";
import { userIdentityService } from "@/services/user-identities";
import { customerProjectLogShareCampaignRepository, type CustomerProjectLogShareCampaignRow } from "@/repositories/customer-project-log-share-campaigns";
import {
  marketingCampaignRepository,
  type MarketingCampaignProjectScopeRow,
  type MarketingCampaignRow,
} from "@/repositories/marketing-campaigns";
import {
  marketingCampaignTemplateRepository,
  type MarketingCampaignTemplateRow,
  type MarketingCampaignTemplateStatus,
} from "@/repositories/marketing-campaign-templates";
import {
  customerAppointmentRewardCampaignRepository,
  type CustomerAppointmentRewardCampaignRow,
} from "@/repositories/customer-appointment-reward-campaigns";
import { projectShareCampaignConfigRepository, type ProjectShareCampaignConfigRow } from "@/repositories/project-share-campaign-configs";
import { customerProjectLogShareRepository } from "@/repositories/customer-project-log-shares";
import type {
  AssistCustomerProjectLogShareCampaignInput,
  ClaimCustomerProjectLogShareCampaignInput,
  ClaimCustomerProjectLogShareVoucherInput,
  CreateCustomerProjectLogShareRecordInput,
  CreateCustomerProjectLogShareCampaignInput,
  GenerateCustomerProjectLogShareCopyInput,
  GetCustomerProjectLogShareCardQuery,
  OpenCustomerProjectLogShareCampaignInput,
} from "@/schema/customer-project-log-share";
import type {
  CreateMarketingCampaignInput,
  CreateMarketingCampaignTemplateInput,
  AppointmentRewardConfigPayload,
  MarketingCampaignInstanceListQuery,
  MarketingCampaignListQuery,
  MarketingCampaignStatusUpdateInput,
  ShareAssistConfigPayload,
  MarketingCampaignTemplateListQuery,
  MarketingCampaignTemplateStatusUpdateInput,
  MarketingCampaignUpsertInput,
  UpdateMarketingCampaignInput,
  UpdateMarketingCampaignTemplateInput,
} from "@/schema/marketing-center-campaign";
import type {
  CustomerAppointmentRewardSubmitInput,
  EmployeeAppointmentRewardArriveInput,
  EmployeeAppointmentRewardClaimInput,
} from "@/schema/appointment-reward";
import type {
  EmployeeShareCampaignListQuery,
  EmployeeShareCampaignStatsSummaryQuery,
  PostEmployeeShareCampaignStatusInput,
  PostProjectShareCampaignConfigStatusInput,
  PutProjectShareCampaignConfigInput,
} from "@/schema/share-campaign-management";
import { SupabaseDB } from "@/utils/supabase";
import {
  PROJECT_LOG_STAGE_CONFIG,
  ProjectStatusConfig,
  isProjectLogStageCode,
  isProjectStatus,
  type ProjectLogStageCode,
} from "@gooes/domain";
import {
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
} from "@/services/files/file-url-resolver";

import {
  buildCampaignRewardTitle,
  CUSTOMER_APPOINTMENT_REWARD_CAMPAIGN_CACHE_TTL_MS,
  CUSTOMER_PROJECT_CAMPAIGN_SUMMARY_CACHE_TTL_MS,
  CUSTOMER_PROJECT_LOG_SHARE_HOT_CACHE_TTL_MS,
  DEFAULT_SHARE_REWARD_REMARK,
  MAX_CUSTOMER_PROJECT_LOG_SHARE_HOT_CACHE_SIZE,
  buildRewardClaimVoucherToken,
  type RewardClaimVoucherStatus,
  buildCopyPrompt,
  buildDefaultConfigRewardTitle,
  buildMiniProgramScene,
  buildRewardClaimCode,
  buildShareRewardCode,
  buildShareToken,
  buildVoucherMiniProgramScene,
  fallbackCopies,
  getAppointmentRewardClaimInstruction,
  getAppointmentRewardTitle,
  getCampaignRewardRemark,
  getCampaignRewardTitle,
  getCustomerProjectLogShareTargetAssistCount,
  getDefaultRewardClaimInstruction,
  getWechatShareCampaignClaimVoucherPage,
  getWechatShareCampaignPage,
  maskDisplayName,
  normalizePhoneLike,
  normalizeProjectLogImages,
  normalizeRelation,
  normalizeShareToken,
  normalizeStringArray,
  normalizeVoucherToken,
  parseCopiesResult,
  type ActiveBusinessMembership,
  type AppointmentRewardSummary,
  type CampaignOwnerRow,
  type CustomerProjectLogRow,
  type CustomerProjectLogShareContext,
  type CustomerProjectScope,
  type CustomerProjectRow,
  type CustomerRow,
  type EffectiveShareCampaignConfig,
  type GeneratedShareCopy,
  type MarketingCampaignTemplateSnapshot,
  type RecentHelperSummary,
  type RewardClaimVoucherPayload,
  type ShareCampaignSummary,
  type UserProfileRow,
  type ViewerAssistInfo,
} from './shared';

export async function listMarketingCampaignInstances(this: any, 
  authContext: AuthContext,
  campaignId: string,
  query: MarketingCampaignInstanceListQuery,
) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.read",
  );
  const campaign = await this.getMarketingCampaignOrThrow(campaignId, tenantId);
  const scopes = await marketingCampaignRepository.listScopesByCampaignId(campaignId, tenantId);
  if (!this.campaignVisibleToEmployee(campaign, scopes, visibleProjectIds)) {
    throw Errors.forbidden();
  }

  if (campaign.campaign_type === "appointment_reward") {
    const result = await customerAppointmentRewardCampaignRepository.listForEmployee({
      campaignId,
      projectIds: visibleProjectIds,
      status: query.status,
      rewardClaimStatus: query.rewardClaimStatus,
      keyword: query.keyword,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      list: result.list,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: result.total ? Math.ceil(result.total / query.pageSize) : 0,
      },
    };
  }

  const result = await customerProjectLogShareCampaignRepository.listForEmployee({
    campaignId,
    projectIds: visibleProjectIds,
    status: query.status,
    rewardClaimStatus: query.rewardClaimStatus,
    keyword: query.keyword,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    list: result.list.map((item) => ({
      ...item,
      remaining_count: Math.max(item.target_assist_count - item.assist_count, 0),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      totalPages: result.total ? Math.ceil(result.total / query.pageSize) : 0,
    },
  };
}

export async function getEmployeeAppointmentRewardCampaignDetail(this: any, instanceId: string) {
  const instance = await customerAppointmentRewardCampaignRepository.findById(instanceId);
  if (!instance) {
    throw Errors.business(
      404,
      "预约奖励实例不存在",
      ErrorCodes.APPOINTMENT_REWARD_INSTANCE_NOT_FOUND,
    );
  }

  const campaign = await this.getMarketingCampaignOrThrow(instance.campaign_id);
  const project = await this.getOwnedProjectById(instance.project_id);
  const customer = await this.getCustomerById(instance.customer_id);
  const finalInstance = await this.ensureAppointmentRewardMetadata(instance);
  const voucher = this.buildAppointmentRewardVoucherPayload(finalInstance);

  return {
    instance_id: finalInstance.id,
    campaign_id: finalInstance.campaign_id,
    campaign_type: "appointment_reward" as const,
    customer_id: finalInstance.customer_id,
    customer_name: customer.name,
    project_id: finalInstance.project_id,
    project_name: project.name,
    appointment_name: finalInstance.appointment_name,
    appointment_phone: finalInstance.appointment_phone,
    appointment_time: finalInstance.appointment_time,
    status: finalInstance.status,
    reward_claim_status: finalInstance.reward_claim_status,
    reward_claim_code: finalInstance.reward_claim_code,
    achieved_at: finalInstance.achieved_at,
    reward_claimed_at: finalInstance.reward_claimed_at,
    reward_title: getAppointmentRewardTitle(campaign.reward_title),
    reward_claim_instruction: getAppointmentRewardClaimInstruction(campaign.reward_claim_instruction),
    voucher: voucher
      ? {
        voucher_token: voucher.voucher_token,
        status: voucher.status,
        expires_at: voucher.expires_at,
      }
      : null,
    created_at: finalInstance.created_at,
    updated_at: finalInstance.updated_at,
  };
}

export async function confirmEmployeeAppointmentRewardArrive(this: any, 
  instanceId: string,
) {
  const instance = await customerAppointmentRewardCampaignRepository.findById(instanceId);
  if (!instance) {
    throw Errors.business(
      404,
      "预约奖励实例不存在",
      ErrorCodes.APPOINTMENT_REWARD_INSTANCE_NOT_FOUND,
    );
  }

  if (instance.status === "reward_claimed" || instance.reward_claim_status === "claimed") {
    throw Errors.business(
      409,
      "当前预约奖励已领奖",
      ErrorCodes.APPOINTMENT_REWARD_ALREADY_CLAIMED,
    );
  }

  if (instance.status === "achieved") {
    throw Errors.business(
      409,
      "当前预约奖励已达成",
      ErrorCodes.APPOINTMENT_REWARD_ALREADY_ACHIEVED,
    );
  }

  const campaign = await this.getMarketingCampaignOrThrow(instance.campaign_id);
  const payload = this.parseAppointmentRewardConfigPayload(campaign.config_payload);

  if (payload.achievement_mode !== "store_checkin") {
    throw Errors.business(
      409,
      "当前活动无需确认到店",
      ErrorCodes.APPOINTMENT_REWARD_ALREADY_ACHIEVED,
    );
  }

  const updated = await customerAppointmentRewardCampaignRepository.update({
    id: instance.id,
    status: "achieved",
    reward_claim_status: "unclaimed",
    achieved_at: new Date().toISOString(),
    reward_claim_code: instance.reward_claim_code || buildRewardClaimCode(instance),
    reward_claim_voucher_token: instance.reward_claim_voucher_token || buildRewardClaimVoucherToken(),
  });

  return {
    instance_id: updated.id,
    status: updated.status,
    reward_claim_status: updated.reward_claim_status,
    achieved_at: updated.achieved_at,
  };
}

export async function claimEmployeeAppointmentReward(this: any, 
  instanceId: string,
  employeeId: string,
  input: EmployeeAppointmentRewardClaimInput,
) {
  const instance = await customerAppointmentRewardCampaignRepository.findById(instanceId);
  if (!instance) {
    throw Errors.business(
      404,
      "预约奖励实例不存在",
      ErrorCodes.APPOINTMENT_REWARD_INSTANCE_NOT_FOUND,
    );
  }

  const finalInstance = await this.ensureAppointmentRewardMetadata(instance);
  const campaign = await this.getMarketingCampaignOrThrow(finalInstance.campaign_id);
  const payload = this.parseAppointmentRewardConfigPayload(campaign.config_payload);

  if (finalInstance.status === "reward_claimed" || finalInstance.reward_claim_status === "claimed") {
    throw Errors.business(
      409,
      "当前预约奖励已领奖",
      ErrorCodes.APPOINTMENT_REWARD_ALREADY_CLAIMED,
    );
  }

  if (finalInstance.status !== "achieved") {
    throw Errors.business(
      409,
      payload.achievement_mode === "store_checkin"
        ? "当前活动需确认到店后才能领奖"
        : "当前预约奖励未达成",
      payload.achievement_mode === "store_checkin"
        ? ErrorCodes.APPOINTMENT_REWARD_STORE_CHECKIN_REQUIRED
        : ErrorCodes.APPOINTMENT_REWARD_ALREADY_SUBMITTED,
    );
  }

  const updated = await customerAppointmentRewardCampaignRepository.update({
    id: finalInstance.id,
    status: "reward_claimed",
    reward_claim_status: "claimed",
    reward_claimed_at: new Date().toISOString(),
    reward_claimed_by_employee_id: employeeId,
    reward_claim_channel: input.channel,
  });

  return {
    instance_id: updated.id,
    status: updated.status,
    reward_claim_status: updated.reward_claim_status,
    reward_claimed_at: updated.reward_claimed_at,
  };
}
