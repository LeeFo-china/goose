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

import type { ClaimVoucherDecision } from "../claim-voucher-policy";
import {
  claimResolvedVoucher,
  decideResolvedClaimVoucher,
  resolveClaimVoucher,
  type ResolvedClaimVoucher,
} from "../claim-voucher-resolver";

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

export async function getEmployeeShareCampaignDetail(this: any, campaignId: string) {
  const campaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
  if (!campaign) {
    throw Errors.business(404, "助力活动不存在", ErrorCodes.SHARE_CAMPAIGN_NOT_FOUND);
  }

  const finalCampaign = await this.ensureCampaignPhase2Metadata(campaign);
  const detail = await this.buildCampaignPublicDetail(finalCampaign.share_token);
  const owner = await this.getCustomerById(finalCampaign.customer_id);
  const recentHelpers = await this.getRecentHelpers(finalCampaign.id, 3);
  const voucher = this.buildRewardClaimVoucherPayload(finalCampaign);

  return {
    campaign_id: finalCampaign.id,
    project_id: finalCampaign.project_id,
    project_name: detail.project_name,
    customer_id: finalCampaign.customer_id,
    customer_name: owner.name,
    log_id: finalCampaign.log_id,
    log_title: detail.node_name || detail.stage_label || "施工日志更新",
    status: finalCampaign.status,
    reward_claim_status: finalCampaign.reward_claim_status,
    assist_count: finalCampaign.assist_count,
    target_assist_count: finalCampaign.target_assist_count,
    remaining_count: Math.max(finalCampaign.target_assist_count - finalCampaign.assist_count, 0),
    reward_title: getCampaignRewardTitle(finalCampaign),
    reward_remark: getCampaignRewardRemark(finalCampaign),
    reward_claim_instruction: finalCampaign.reward_claim_instruction,
    reward_claim_channel: finalCampaign.reward_claim_channel,
    reward_claim_code: finalCampaign.reward_claim_code,
    reward_claimed_at: finalCampaign.reward_claimed_at,
    voucher: voucher
      ? {
        voucher_token: voucher.voucher_token,
        status: voucher.status,
        expires_at: voucher.expires_at,
      }
      : null,
    recent_helpers: recentHelpers,
    started_at: finalCampaign.created_at,
    valid_until: finalCampaign.valid_until,
  };
}

export async function listEmployeeShareCampaignHelpers(this: any, campaignId: string, page: number, pageSize: number) {
  const campaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
  if (!campaign) {
    throw Errors.business(404, "助力活动不存在", ErrorCodes.SHARE_CAMPAIGN_NOT_FOUND);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const result = await customerProjectLogShareCampaignRepository.listValidAssists({
    campaign_id: campaign.id,
    from,
    to,
  });

  return {
    list: this.serializeRecentHelpers(result.list),
    pagination: {
      page,
      pageSize,
      total: result.count,
      totalPages: result.count ? Math.ceil(result.count / pageSize) : 0,
    },
  };
}

export async function updateEmployeeShareCampaignStatus(this: any, 
  campaignId: string,
  input: PostEmployeeShareCampaignStatusInput,
) {
  const campaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
  if (!campaign) {
    throw Errors.business(404, "助力活动不存在", ErrorCodes.SHARE_CAMPAIGN_NOT_FOUND);
  }

  if (campaign.status === "closed") {
    throw Errors.business(409, "当前活动已关闭", ErrorCodes.SHARE_CAMPAIGN_ALREADY_CLOSED);
  }

  if (campaign.status === "reward_claimed") {
    throw Errors.business(409, "已领奖活动不支持关闭", ErrorCodes.SHARE_CAMPAIGN_STATUS_INVALID);
  }

  const updated = await customerProjectLogShareCampaignRepository.updateStatus({
    id: campaign.id,
    status: input.status,
    closed_reason: input.reason,
  });

  return {
    campaign_id: updated.id,
    status: updated.status,
    reward_claim_status: updated.reward_claim_status,
    closed_reason: updated.closed_reason,
  };
}

export async function getEmployeeShareCampaignStatsSummary(this: any, 
  authContext: AuthContext,
  query: EmployeeShareCampaignStatsSummaryQuery,
) {
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.read",
  );

  const summary = await customerProjectLogShareCampaignRepository.getStatsSummary({
    projectIds: visibleProjectIds,
    projectId: query.projectId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });

  return {
    ...summary,
    total_share_open_count: null,
    total_share_save_count: null,
    achievement_rate: summary.campaign_count
      ? Number((summary.achieved_count / summary.campaign_count).toFixed(4))
      : 0,
    claim_rate: summary.achieved_count
      ? Number((summary.reward_claimed_count / summary.achieved_count).toFixed(4))
      : 0,
  };
}

export async function getCampaignMetaForEmployeeClaim(this: any, campaignId: string) {
  const shareCampaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
  if (shareCampaign) {
    return {
      id: shareCampaign.id,
      project_id: shareCampaign.project_id,
      status: shareCampaign.status,
      campaign_type: "share_assist" as const,
    };
  }

  const appointmentCampaign = await customerAppointmentRewardCampaignRepository.findById(campaignId);
  if (appointmentCampaign) {
    return {
      id: appointmentCampaign.id,
      project_id: appointmentCampaign.project_id,
      status: appointmentCampaign.status,
      campaign_type: "appointment_reward" as const,
    };
  }

  throw Errors.badRequest("活动实例不存在");
}

const claimVoucherRepositories = {
  share: customerProjectLogShareCampaignRepository,
  appointment: customerAppointmentRewardCampaignRepository,
};

async function resolveEmployeeClaimVoucher(
  service: any,
  voucherToken: string,
): Promise<ResolvedClaimVoucher> {
  const resolved = await resolveClaimVoucher(
    normalizeVoucherToken(voucherToken),
    claimVoucherRepositories,
  );
  if (!resolved) {
    throw Errors.badRequest("领取凭证不存在");
  }

  if (resolved.campaignType === "share_assist") {
    return {
      campaignType: "share_assist",
      instance: await service.ensureCampaignPhase2Metadata(resolved.instance),
    };
  }

  return {
    campaignType: "appointment_reward",
    instance: await service.ensureAppointmentRewardMetadata(resolved.instance),
  };
}

function assertClaimVoucherCanClaim(decision: ClaimVoucherDecision): void {
  if (decision.canClaim) {
    return;
  }

  const messageByReason = {
    already_claimed: "当前活动奖励已领取",
    voucher_expired: "领取凭证已过期",
    campaign_not_achieved: "当前活动未达到领奖状态",
    campaign_closed: "当前活动已关闭",
    voucher_invalid: "领取凭证不存在",
  } as const;
  throw Errors.badRequest(
    decision.blockReason
      ? messageByReason[decision.blockReason]
      : "领取凭证不可用",
  );
}

export async function getVoucherMetaForEmployeeClaim(this: any, voucherToken: string) {
  const resolved = await resolveEmployeeClaimVoucher(this, voucherToken);
  return {
    id: resolved.instance.id,
    project_id: resolved.instance.project_id,
    status: resolved.instance.status,
    campaign_type: resolved.campaignType,
    reward_claim_voucher_token: resolved.instance.reward_claim_voucher_token,
  };
}

export async function getEmployeeVoucherDetail(this: any, voucherToken: string) {
  const resolved = await resolveEmployeeClaimVoucher(this, voucherToken);
  const decision = decideResolvedClaimVoucher(resolved);

  if (resolved.campaignType === "share_assist") {
    const campaign = resolved.instance;
    const [detail, owner] = await Promise.all([
      this.buildCampaignPublicDetail(campaign.share_token),
      this.getCustomerById(campaign.customer_id),
    ]);

    return {
      voucher_token: campaign.reward_claim_voucher_token,
      campaign_id: campaign.id,
      instance_id: campaign.id,
      marketing_campaign_id: campaign.campaign_id,
      campaign_type: "share_assist" as const,
      project_id: campaign.project_id,
      status: campaign.status,
      reward_claim_status: campaign.reward_claim_status,
      claim_code: campaign.reward_claim_code,
      customer_name: maskDisplayName(owner.name),
      project_name: detail.project_name,
      reward_title: getCampaignRewardTitle(campaign),
      reward_claim_channel: campaign.reward_claim_channel,
      reward_claim_instruction: campaign.reward_claim_instruction,
      can_claim: decision.canClaim,
      claim_block_reason: decision.blockReason,
      claimed_at: campaign.reward_claimed_at,
      expires_at: campaign.reward_claim_voucher_expires_at,
      voucher_status: decision.voucherStatus,
    };
  }

  const instance = resolved.instance;
  const [campaign, project, owner] = await Promise.all([
    this.getMarketingCampaignOrThrow(instance.campaign_id),
    this.getOwnedProjectById(instance.project_id),
    this.getCustomerById(instance.customer_id),
  ]);

  return {
    voucher_token: instance.reward_claim_voucher_token,
    campaign_id: instance.id,
    instance_id: instance.id,
    marketing_campaign_id: instance.campaign_id,
    campaign_type: "appointment_reward" as const,
    project_id: instance.project_id,
    status: instance.status,
    reward_claim_status: instance.reward_claim_status,
    claim_code: instance.reward_claim_code,
    customer_name: maskDisplayName(owner.name),
    project_name: project.name,
    reward_title: getAppointmentRewardTitle(campaign.reward_title),
    reward_claim_channel: instance.reward_claim_channel || "store",
    reward_claim_instruction: getAppointmentRewardClaimInstruction(
      campaign.reward_claim_instruction,
    ),
    can_claim: decision.canClaim,
    claim_block_reason: decision.blockReason,
    claimed_at: instance.reward_claimed_at,
    expires_at: null,
    voucher_status: decision.voucherStatus,
  };
}

export async function claimCampaignReward(this: any, 
  campaignId: string,
  employeeId: string,
  input: ClaimCustomerProjectLogShareCampaignInput,
) {
  const campaign = await this.ensureCampaignPhase2Metadata(
    await customerProjectLogShareCampaignRepository.findById(campaignId)
    || (() => {
      throw Errors.badRequest("分享活动不存在");
    })(),
  );

  if (campaign.status === "reward_claimed" || campaign.reward_claim_status === "claimed") {
    throw Errors.badRequest("当前活动奖励已领取");
  }

  if (!this.isCampaignRewardClaimable(campaign)) {
    throw Errors.badRequest(campaign.status === "closed" ? "当前活动已关闭" : "当前活动未达到领奖状态");
  }

  if (!campaign.reward_claim_code || input.claim_code !== campaign.reward_claim_code) {
    throw Errors.badRequest("领奖码不匹配");
  }

  const updatedCampaign = await customerProjectLogShareCampaignRepository.updateRewardMetadata({
    id: campaign.id,
    status: "reward_claimed",
    reward_claim_status: "claimed",
    reward_claim_channel: input.channel,
    reward_claimed_at: new Date().toISOString(),
    reward_claimed_by_employee_id: employeeId,
  });

  return {
    campaign_id: updatedCampaign.id,
    status: updatedCampaign.status,
    reward_claim_status: updatedCampaign.reward_claim_status,
    reward_claimed_at: updatedCampaign.reward_claimed_at,
  };
}

export async function claimCampaignRewardByVoucher(this: any, 
  voucherToken: string,
  employeeId: string,
  input: ClaimCustomerProjectLogShareVoucherInput,
) {
  const resolved = await resolveEmployeeClaimVoucher(this, voucherToken);
  assertClaimVoucherCanClaim(decideResolvedClaimVoucher(resolved));

  const updatedCampaign = await claimResolvedVoucher(resolved, {
    employeeId,
    channel: input.channel,
    claimedAt: new Date().toISOString(),
  }, claimVoucherRepositories);
  if (!updatedCampaign) {
    const latest = await resolveEmployeeClaimVoucher(this, voucherToken);
    const latestDecision = decideResolvedClaimVoucher(latest);
    assertClaimVoucherCanClaim(latestDecision);
    throw Errors.badRequest("领取凭证状态已变更，请刷新后重试");
  }

  return {
    voucher_token: resolved.instance.reward_claim_voucher_token,
    campaign_id: updatedCampaign.id,
    instance_id: updatedCampaign.id,
    campaign_type: resolved.campaignType,
    status: updatedCampaign.status,
    reward_claim_status: updatedCampaign.reward_claim_status,
    reward_claimed_at: updatedCampaign.reward_claimed_at,
  };
}
