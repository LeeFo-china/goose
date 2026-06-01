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

export async function getOrCreateShareCampaign(this: any, 
  authUserId: string,
  projectId: string,
  logId: string,
  input: CreateCustomerProjectLogShareCampaignInput,
) {
  const { campaign } = await this.resolveShareCampaignForOwnedLog({
    authUserId,
    projectId,
    logId,
    channel: input.channel,
  });

  return this.buildCampaignSummary(await this.ensureCampaignPhase2Metadata(campaign));
}

export async function getShareCampaignDetail(this: any, 
  shareToken: string,
  viewer?: { authUserId?: string | null; openid?: string | null },
) {
  const detail = await this.buildCampaignPublicDetail(shareToken);
  const owner = await this.getCustomerById(detail.campaign.customer_id);
  const campaign = await this.ensureCampaignPhase2Metadata(detail.campaign);
  const viewerInfo = await this.buildViewerAssistInfo(campaign, owner, viewer);
  const recentHelpers = await this.getRecentHelpers(campaign.id, 3);

  return {
    campaign_id: campaign.id,
    share_token: campaign.share_token,
    status: campaign.status,
    reward_claim_status: campaign.reward_claim_status,
    project_name: detail.project_name,
    stage_code: detail.stage_code,
    stage_label: detail.stage_label,
    log_title: detail.node_name || detail.stage_label || "施工日志更新",
    log_content: detail.log_content,
    images: detail.log_images,
    customer_nickname: detail.customer_nickname,
    assist_count: campaign.assist_count,
    target_assist_count: campaign.target_assist_count,
    remaining_count: Math.max(campaign.target_assist_count - campaign.assist_count, 0),
    reward_title: getCampaignRewardTitle(campaign),
    reward_remark: getCampaignRewardRemark(campaign),
    reward_claim_instruction: campaign.reward_claim_instruction,
    viewer: viewerInfo,
    recent_helpers: recentHelpers,
  };
}

export async function openShareCampaign(this: any, 
  input: OpenCustomerProjectLogShareCampaignInput,
  visitor: {
    authUserId?: string;
    openid?: string | null;
    ip?: string | null;
  },
) {
  const campaign = await this.getCampaignByToken(input.share_token);
  const now = new Date().toISOString();
  await customerProjectLogShareCampaignRepository.createOpen({
    campaign_id: campaign.id,
    share_token: campaign.share_token,
    visitor_auth_user_id: visitor.authUserId ?? null,
    visitor_openid: visitor.openid ?? null,
    visitor_device_id: null,
    visitor_ip: visitor.ip ?? null,
    source: input.source,
  });
  const updated = await customerProjectLogShareCampaignRepository.touchLatestOpenedAt(
    campaign.id,
    now,
  );

  return {
    campaign_id: updated.id,
    share_token: updated.share_token,
    assist_count: updated.assist_count,
    target_assist_count: updated.target_assist_count,
    remaining_count: Math.max(updated.target_assist_count - updated.assist_count, 0),
    status: updated.status,
  };
}

export async function assistShareCampaign(this: any, 
  input: AssistCustomerProjectLogShareCampaignInput,
  helper: {
    authUserId: string;
    openid?: string | null;
    ip?: string | null;
  },
) {
  const campaign = await this.ensureCampaignPhase2Metadata(
    await this.getCampaignByToken(input.share_token),
  );

  if (campaign.status !== "active") {
    if (campaign.status === "achieved") {
      throw this.buildAssistBlockedError({
        statusCode: 409,
        code: ErrorCodes.CAMPAIGN_ACHIEVED,
        message: "当前活动已达标",
        campaign,
        reason: "campaign_achieved",
      });
    }

    if (campaign.status === "reward_claimed") {
      throw this.buildAssistBlockedError({
        statusCode: 409,
        code: ErrorCodes.REWARD_CLAIMED,
        message: "当前活动奖励已领取",
        campaign,
        reason: "reward_claimed",
      });
    }

    throw this.buildAssistBlockedError({
      statusCode: 409,
      code: ErrorCodes.CAMPAIGN_CLOSED,
      message: "当前活动已关闭",
      campaign,
      reason: "campaign_closed",
    });
  }

  const owner = await this.getCustomerById(campaign.customer_id);
  if (owner.user_id && owner.user_id === helper.authUserId) {
    throw this.buildAssistBlockedError({
      statusCode: 403,
      code: ErrorCodes.OWNER_SELF_NOT_ALLOWED,
      message: "不能给自己助力",
      campaign,
      reason: "owner_self",
    });
  }

  const existingAssist = await customerProjectLogShareCampaignRepository.findAssist({
    campaign_id: campaign.id,
    helper_auth_user_id: helper.authUserId,
    helper_openid: helper.openid ?? null,
  });
  if (existingAssist) {
    throw this.buildAssistBlockedError({
      statusCode: 409,
      code: ErrorCodes.ALREADY_ASSISTED,
      message: "你已经助力过了",
      campaign,
      reason: "already_assisted",
    });
  }

  const helperProfile = await this.getUserProfileByAuthUserId(helper.authUserId);
  const helperName = helperProfile?.nickname || "好友";
  const helperAvatar = this.getImagePublicUrl(helperProfile?.avatar_path) || null;
  const now = new Date().toISOString();

  await customerProjectLogShareCampaignRepository.createAssist({
    campaign_id: campaign.id,
    share_token: campaign.share_token,
    helper_auth_user_id: helper.authUserId,
    helper_openid: helper.openid ?? null,
    helper_device_id: null,
    helper_ip: helper.ip ?? null,
    source: input.source,
    helper_name: helperName,
    helper_avatar: helperAvatar,
  });

  const assistCount = await customerProjectLogShareCampaignRepository.countAssists(campaign.id);
  const nextStatus = assistCount >= campaign.target_assist_count ? "achieved" : "active";
  const updatedCampaign = await customerProjectLogShareCampaignRepository.updateMetrics({
    id: campaign.id,
    assist_count: assistCount,
    assist_uv: assistCount,
    status: nextStatus,
    latest_assisted_at: now,
    achieved_at: nextStatus === "achieved"
      ? (campaign.achieved_at || new Date().toISOString())
      : null,
    reward_claim_status: nextStatus === "achieved"
      ? (campaign.reward_claim_status === "claimed" ? "claimed" : "unclaimed")
      : campaign.reward_claim_status,
    reward_claim_code: nextStatus === "achieved"
      ? (campaign.reward_claim_code || buildRewardClaimCode(campaign))
      : campaign.reward_claim_code,
    reward_claim_instruction: campaign.reward_claim_instruction
      || getDefaultRewardClaimInstruction(campaign.target_assist_count),
    reward_claim_channel: campaign.reward_claim_channel || "store",
  });

  return {
    success: true,
    campaign_id: updatedCampaign.id,
    share_token: updatedCampaign.share_token,
    status: updatedCampaign.status,
    reward_claim_status: updatedCampaign.reward_claim_status,
    assist_count: updatedCampaign.assist_count,
    target_assist_count: updatedCampaign.target_assist_count,
    remaining_count: Math.max(
      updatedCampaign.target_assist_count - updatedCampaign.assist_count,
      0,
    ),
  };
}
