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

export async function getOrCreateCustomerAppointmentRewardCampaign(this: any, 
  authUserId: string,
  projectId: string,
  scope?: CustomerProjectScope,
) {
  const [{ customer, project }, matched] = await Promise.all([
    this.getOwnedProject(authUserId, projectId, scope),
    this.getMatchingMarketingCampaign(projectId, "appointment_reward", scope?.tenantId),
  ]);

  if (!matched) {
    throw Errors.business(
      404,
      "当前项目未命中预约奖励活动",
      ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND,
    );
  }

  const payload = this.parseAppointmentRewardConfigPayload(matched.campaign.config_payload);
  let instance = await customerAppointmentRewardCampaignRepository.findByCampaignCustomerProject({
    campaign_id: matched.campaign.id,
    customer_id: customer.id,
    project_id: project.id,
  });

  if (!instance) {
    instance = await customerAppointmentRewardCampaignRepository.create({
      campaign_id: matched.campaign.id,
      customer_id: customer.id,
      project_id: project.id,
    });
  }

  const summary = this.buildAppointmentRewardSummary(matched.campaign);

  return {
    instance_id: instance.id,
    campaign_id: matched.campaign.id,
    campaign_type: "appointment_reward" as const,
    status: instance.status,
    reward_claim_status: instance.reward_claim_status,
    project_id: project.id,
    project_name: project.name,
    reward_title: summary.reward_title,
    reward_claim_instruction: summary.reward_claim_instruction,
    display_title: summary.display_title,
    display_subtitle: summary.display_subtitle,
  };
}

export async function loadCustomerAppointmentRewardCampaign(this: any, 
  authUserId: string,
  projectId: string,
  cacheKey: string,
  scope?: CustomerProjectScope,
) {
  const [{ customer, project }, matched] = await Promise.all([
    this.getOwnedProject(authUserId, projectId, scope),
    this.getMatchingMarketingCampaign(projectId, "appointment_reward", scope?.tenantId),
  ]);

  if (!matched) {
    this.setCachedCustomerAppointmentRewardCampaignMiss(cacheKey);
    throw Errors.business(
      404,
      "当前项目未命中预约奖励活动",
      ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND,
    );
  }

  let instance = await customerAppointmentRewardCampaignRepository.findByCampaignCustomerProject({
    campaign_id: matched.campaign.id,
    customer_id: customer.id,
    project_id: project.id,
  });

  if (instance) {
    instance = await this.ensureAppointmentRewardMetadata(instance);
  }

  const summary = this.buildAppointmentRewardSummary(matched.campaign);
  const voucher = instance ? this.buildAppointmentRewardVoucherPayload(instance) : null;

  return {
    instance_id: instance?.id ?? null,
    campaign_id: matched.campaign.id,
    campaign_type: "appointment_reward" as const,
    status: instance?.status ?? "active",
    reward_claim_status: instance?.reward_claim_status ?? "unclaimed",
    project_id: project.id,
    project_name: project.name,
    appointment_name: instance?.appointment_name ?? null,
    appointment_phone: instance?.appointment_phone ?? null,
    appointment_time: instance?.appointment_time ?? null,
    achieved_at: instance?.achieved_at ?? null,
    reward_claimed_at: instance?.reward_claimed_at ?? null,
    reward_title: summary.reward_title,
    reward_claim_instruction: summary.reward_claim_instruction,
    display_title: summary.display_title,
    display_subtitle: summary.display_subtitle,
    reward_claim_voucher: voucher,
  };
}

export async function getCustomerAppointmentRewardCampaign(this: any, 
  authUserId: string,
  projectId: string,
  scope?: CustomerProjectScope,
) {
  const cacheKey = this.customerAppointmentRewardCampaignCacheKey(authUserId, projectId, scope);
  if (this.hasCachedCustomerAppointmentRewardCampaignMiss(cacheKey)) {
    throw Errors.business(
      404,
      "当前项目未命中预约奖励活动",
      ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND,
    );
  }

  const inFlight = this.customerAppointmentRewardCampaignInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = this.loadCustomerAppointmentRewardCampaign(
    authUserId,
    projectId,
    cacheKey,
    scope,
  ).finally(() => {
    if (this.customerAppointmentRewardCampaignInFlight.get(cacheKey) === request) {
      this.customerAppointmentRewardCampaignInFlight.delete(cacheKey);
    }
  });
  this.customerAppointmentRewardCampaignInFlight.set(cacheKey, request);
  return request;
}

export async function submitCustomerAppointmentRewardCampaign(this: any, 
  authUserId: string,
  projectId: string,
  input: CustomerAppointmentRewardSubmitInput,
) {
  const [{ customer, project }, matched] = await Promise.all([
    this.getOwnedProject(authUserId, projectId),
    this.getMatchingMarketingCampaign(projectId, "appointment_reward"),
  ]);

  if (!matched) {
    throw Errors.business(
      404,
      "当前项目未命中预约奖励活动",
      ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND,
    );
  }

  const appointmentTime = new Date(input.appointment_time);
  if (Number.isNaN(appointmentTime.getTime())) {
    throw Errors.business(
      400,
      "预约时间不合法",
      ErrorCodes.APPOINTMENT_REWARD_INVALID_APPOINTMENT_TIME,
    );
  }

  const payload = this.parseAppointmentRewardConfigPayload(matched.campaign.config_payload);

  let instance = await customerAppointmentRewardCampaignRepository.findByCampaignCustomerProject({
    campaign_id: matched.campaign.id,
    customer_id: customer.id,
    project_id: project.id,
  });

  if (!instance) {
    instance = await customerAppointmentRewardCampaignRepository.create({
      campaign_id: matched.campaign.id,
      customer_id: customer.id,
      project_id: project.id,
    });
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

  if (instance.appointment_name || instance.appointment_phone || instance.appointment_time) {
    throw Errors.business(
      409,
      "当前预约奖励已提交预约信息",
      ErrorCodes.APPOINTMENT_REWARD_ALREADY_SUBMITTED,
    );
  }

  instance = await customerAppointmentRewardCampaignRepository.update({
    id: instance.id,
    appointment_name: input.appointment_name,
    appointment_phone: normalizePhoneLike(input.appointment_phone),
    appointment_time: input.appointment_time,
    status: payload.achievement_mode === "appointment_submit" ? "achieved" : "active",
    reward_claim_status: "unclaimed",
    achieved_at: payload.achievement_mode === "appointment_submit" ? new Date().toISOString() : null,
    reward_claim_code: payload.achievement_mode === "appointment_submit" ? buildRewardClaimCode(instance) : null,
    reward_claim_voucher_token: payload.achievement_mode === "appointment_submit"
      ? buildRewardClaimVoucherToken()
      : null,
  });

  instance = await this.ensureAppointmentRewardMetadata(instance);
  if (!instance) {
    throw Errors.dbError("预约奖励实例更新后未找到记录");
  }

  return {
    instance_id: instance.id,
    status: instance.status,
    reward_claim_status: instance.reward_claim_status,
    achieved_at: instance.achieved_at,
  };
}
