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
import { selectCustomerProjectCampaignSummaryEntries } from "../campaign-summary-selection";

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

export async function createShareRecord(this: any, 
  authUserId: string,
  projectId: string,
  logId: string,
  input: CreateCustomerProjectLogShareRecordInput,
) {
  const { context, campaign } = await this.resolveOptionalShareCampaignForOwnedLog({
    authUserId,
    projectId,
    logId,
  });
  const record = await customerProjectLogShareRepository.create({
    customer_id: context.customer_id,
    project_id: context.project_id,
    log_id: context.log_id,
    selected_copy_id: input.copy_id ?? null,
    selected_copy_text: input.copy_text ?? null,
    action: input.action,
  });

  if (input.action === "save_image" && campaign) {
    await customerProjectLogShareCampaignRepository.touchPosterSavedAt(campaign.id);
  }

  return {
    ...record,
    campaign: campaign ? this.buildCampaignSummary(campaign) : null,
  };
}

export async function loadCustomerProjectCampaignSummary(this: any, 
  authUserId: string,
  projectId: string,
  scope?: CustomerProjectScope,
) {
  const [{ customer }, configResult] = await Promise.all([
    this.getOwnedProject(authUserId, projectId, scope),
    this.getEffectiveShareCampaignConfig(projectId, scope?.tenantId),
  ]);
  const effectiveMarketingCampaignId = typeof configResult.effective?.campaign_id === "string"
    ? configResult.effective.campaign_id
    : undefined;
  const [campaignRows, rewardCandidateRows, currentActiveCampaign, recentImageLog] = await Promise.all([
    customerProjectLogShareCampaignRepository.listByProject({
      customer_id: customer.id,
      project_id: projectId,
      limit: 20,
    }),
    customerProjectLogShareCampaignRepository.listRewardCandidatesByProject({
      customer_id: customer.id,
      project_id: projectId,
      now: new Date().toISOString(),
      limit: 20,
    }),
    effectiveMarketingCampaignId
      ? customerProjectLogShareCampaignRepository.findLatestActiveByMarketingCampaign({
        customer_id: customer.id,
        project_id: projectId,
        campaign_id: effectiveMarketingCampaignId,
      })
      : Promise.resolve(null),
    this.getRecentImageProjectLog(projectId, scope?.tenantId),
  ]);
  const mergedCampaignRows = [...campaignRows];
  const seenCampaignIds = new Set(campaignRows.map((campaign) => campaign.id));
  for (const campaign of [
    ...rewardCandidateRows,
    ...(currentActiveCampaign ? [currentActiveCampaign] : []),
  ]) {
    if (!seenCampaignIds.has(campaign.id)) {
      seenCampaignIds.add(campaign.id);
      mergedCampaignRows.push(campaign);
    }
  }
  const resolvedCampaigns = await Promise.all(
    mergedCampaignRows.map((campaign) => this.ensureCampaignPhase2Metadata(campaign)),
  );
  const resolvedCampaignById = new Map(
    resolvedCampaigns.map((campaign) => [campaign.id, campaign]),
  );
  const buildSelectionCandidate = (campaign: CustomerProjectLogShareCampaignRow) => ({
    campaign,
    isLegacyRewardClaimable: this.isCampaignRewardClaimable(campaign),
    voucherStatus: this.getRewardClaimVoucherStatus(campaign),
  });
  const {
    pendingRewardCampaign,
    activeCampaign,
    focusCampaign,
  } = selectCustomerProjectCampaignSummaryEntries({
    candidates: resolvedCampaigns.map(buildSelectionCandidate),
    legacyCandidates: campaignRows
      .map((campaign) => resolvedCampaignById.get(campaign.id))
      .filter((campaign): campaign is CustomerProjectLogShareCampaignRow => Boolean(campaign))
      .map(buildSelectionCandidate),
    effectiveMarketingCampaignId,
  });
  const buildSummaryEntry = (campaign: CustomerProjectLogShareCampaignRow | null) => campaign
    ? {
      ...this.buildCampaignSummary(campaign),
      reward_title: getCampaignRewardTitle(campaign),
    }
    : null;
  const recentLog = focusCampaign
    ? await this.getProjectLogById(focusCampaign.log_id)
    : recentImageLog;

  if (!focusCampaign && !recentLog) {
    return {
      project_id: projectId,
      display_mode: configResult.effective ? "empty" as const : "disabled" as const,
      config_enabled: configResult.rawCampaign
        ? Boolean(configResult.rawCampaign.enabled)
        : Boolean(configResult.rawLegacyConfig?.enabled),
      config_status: configResult.rawCampaign?.status || configResult.rawLegacyConfig?.config_status || null,
      recommended_log: null,
      focus_campaign: null,
      pending_reward_campaign: null,
      active_campaign: null,
    };
  }

  const recommendedLog = recentLog
    ? {
      log_id: recentLog.id,
      log_title: recentLog.node_name
        || (isProjectLogStageCode(recentLog.stage_code)
          ? PROJECT_LOG_STAGE_CONFIG[recentLog.stage_code as ProjectLogStageCode].label
          : "施工日志更新"),
      stage_label: isProjectLogStageCode(recentLog.stage_code)
        ? PROJECT_LOG_STAGE_CONFIG[recentLog.stage_code as ProjectLogStageCode].label
        : null,
      created_at: recentLog.created_at,
      cover_image: normalizeProjectLogImages(recentLog.images)[0] || null,
    }
    : null;

  const displayMode = focusCampaign
    ? focusCampaign.status === "achieved" && focusCampaign.reward_claim_status !== "claimed"
      ? "claim_reward"
      : focusCampaign.status === "reward_claimed"
        ? "reward_claimed"
        : "continue_campaign"
    : configResult.effective
      ? "create_campaign"
      : "disabled";

  return {
    project_id: projectId,
    display_mode: displayMode,
    config_enabled: configResult.rawCampaign
      ? Boolean(configResult.rawCampaign.enabled)
      : Boolean(configResult.rawLegacyConfig?.enabled),
    config_status: configResult.rawCampaign?.status || configResult.rawLegacyConfig?.config_status || null,
    recommended_log: recommendedLog,
    focus_campaign: buildSummaryEntry(focusCampaign),
    pending_reward_campaign: buildSummaryEntry(pendingRewardCampaign),
    active_campaign: buildSummaryEntry(activeCampaign),
  };
}

export async function getCustomerProjectCampaignSummary(this: any, 
  authUserId: string,
  projectId: string,
  scope?: CustomerProjectScope,
) {
  const cacheKey = this.customerProjectCampaignSummaryCacheKey(authUserId, projectId, scope);
  const cached = this.getCachedCustomerProjectCampaignSummary(cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = this.customerProjectCampaignSummaryInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = this.loadCustomerProjectCampaignSummary(authUserId, projectId, scope)
    .then((result: any) => {
      this.setCachedCustomerProjectCampaignSummary(cacheKey, result);
      return result;
    })
    .finally(() => {
      if (this.customerProjectCampaignSummaryInFlight.get(cacheKey) === request) {
        this.customerProjectCampaignSummaryInFlight.delete(cacheKey);
      }
    });
  this.customerProjectCampaignSummaryInFlight.set(cacheKey, request);
  return request;
}

export async function getCustomerCampaignDetail(this: any, authUserId: string, campaignId: string) {
  const { campaign } = await this.getOwnedCampaignById(authUserId, campaignId);
  const detail = await this.buildCampaignPublicDetail(campaign.share_token);
  const recentHelpers = await this.getRecentHelpers(campaign.id, 3);
  const rewardClaimVoucher = this.buildRewardClaimVoucherPayload(campaign);

  return {
    campaign_id: campaign.id,
    share_token: campaign.share_token,
    project_id: campaign.project_id,
    log_id: campaign.log_id,
    status: campaign.status,
    reward_claim_status: campaign.reward_claim_status,
    project_name: detail.project_name,
    stage_code: detail.stage_code,
    stage_label: detail.stage_label,
    log_title: detail.node_name || detail.stage_label || "施工日志更新",
    images: detail.log_images,
    assist_count: campaign.assist_count,
    target_assist_count: campaign.target_assist_count,
    remaining_count: Math.max(campaign.target_assist_count - campaign.assist_count, 0),
    reward_title: getCampaignRewardTitle(campaign),
    reward_remark: getCampaignRewardRemark(campaign),
    reward_claim_code: campaign.reward_claim_code,
    reward_claim_instruction: campaign.reward_claim_instruction,
    reward_claim_channel: campaign.reward_claim_channel,
    reward_claimed_at: campaign.reward_claimed_at,
    reward_claim_voucher: rewardClaimVoucher,
    recent_helpers: recentHelpers,
  };
}

export async function listCustomerCampaignHelpers(this: any, 
  authUserId: string,
  campaignId: string,
  page: number,
  pageSize: number,
) {
  const { campaign } = await this.getOwnedCampaignById(authUserId, campaignId);
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
