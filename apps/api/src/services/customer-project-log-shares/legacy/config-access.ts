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

export function getConfigBlockReason(this: any, 
  config: ProjectShareCampaignConfigRow | null,
): "config_missing" | "config_disabled" | "config_paused" | "config_closed" | "config_expired" | null {
  if (!config) {
    return "config_missing";
  }

  if (!config.enabled) {
    return "config_disabled";
  }

  if (config.config_status === "paused") {
    return "config_paused";
  }

  if (config.config_status === "closed") {
    return "config_closed";
  }

  if (config.config_status !== "active") {
    return "config_disabled";
  }

  const now = Date.now();
  if (config.valid_from && new Date(config.valid_from).getTime() > now) {
    return "config_disabled";
  }

  if (
    config.valid_until
    && new Date(config.valid_until).getTime() < now
    && config.auto_close_on_expire
  ) {
    return "config_expired";
  }

  return null;
}

export function getMarketingCampaignBlockReason(this: any, 
  campaign: MarketingCampaignRow | null,
): "config_missing" | "config_disabled" | "config_paused" | "config_closed" | "config_expired" | null {
  if (!campaign) {
    return "config_missing";
  }

  if (!campaign.enabled) {
    return "config_disabled";
  }

  if (campaign.status === "paused") {
    return "config_paused";
  }

  if (campaign.status === "closed") {
    return "config_closed";
  }

  if (campaign.status !== "active") {
    return "config_disabled";
  }

  const now = Date.now();
  if (campaign.valid_from && new Date(campaign.valid_from).getTime() > now) {
    return "config_disabled";
  }

  if (
    campaign.valid_until
    && new Date(campaign.valid_until).getTime() < now
    && campaign.auto_close_on_expire
  ) {
    return "config_expired";
  }

  return null;
}

export function throwConfigBlocked(this: any, 
  reason:
    | NonNullable<any>
    | "existing_active_campaign",
  message?: string,
): never {
  throw Errors.business(
    409,
    message || "当前项目未开启助力活动",
    reason === "config_missing"
      ? ErrorCodes.SHARE_CAMPAIGN_CONFIG_NOT_FOUND
      : ErrorCodes.SHARE_CAMPAIGN_CONFIG_BLOCKED,
    {
      block_reason: reason,
    },
  );
}

export async function getProjectConfig(this: any, projectId: string) {
  return projectShareCampaignConfigRepository.findByProjectId(projectId);
}

export function isProjectInMarketingCampaignScope(this: any, 
  campaign: MarketingCampaignRow,
  scopes: MarketingCampaignProjectScopeRow[],
  projectId: string,
) {
  const related = scopes.filter((item) => item.campaign_id === campaign.id);
  if (campaign.target_scope_type === "project_list") {
    return related.some((item) => item.scope_mode === "include" && item.project_id === projectId);
  }

  return !related.some((item) => item.scope_mode === "exclude" && item.project_id === projectId);
}

export async function getMatchingMarketingCampaign(this: any, 
  projectId: string,
  campaignType: "share_assist" | "appointment_reward" = "share_assist",
  tenantId?: string | null,
) {
  const cacheKey = `${projectId}:${campaignType}`;
  const cached = this.getHotCacheEntry(this.matchingMarketingCampaignCache, cacheKey);
  if (cached) {
    return cached.value;
  }

  const inFlight = this.matchingMarketingCampaignInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = this.loadMatchingMarketingCampaign(projectId, campaignType, tenantId)
    .then((result: any) => {
      this.setHotCacheValue(this.matchingMarketingCampaignCache, cacheKey, result);
      return result;
    })
    .finally(() => {
      if (this.matchingMarketingCampaignInFlight.get(cacheKey) === request) {
        this.matchingMarketingCampaignInFlight.delete(cacheKey);
      }
    });
  this.matchingMarketingCampaignInFlight.set(cacheKey, request);
  return request;
}

export async function loadMatchingMarketingCampaign(this: any, 
  projectId: string,
  campaignType: "share_assist" | "appointment_reward" = "share_assist",
  scopeTenantId?: string | null,
) {
  const tenantId = scopeTenantId ?? await this.getProjectTenantId(projectId);
  const campaigns = await marketingCampaignRepository.listActiveByType(campaignType, tenantId);
  if (!campaigns.length) {
    return null;
  }

  const scopes = await marketingCampaignRepository.listScopesByCampaignIds(
    campaigns.map((item: any) => item.id),
    tenantId,
  );

  const matched = campaigns.find((campaign) => {
    const blockReason = this.getMarketingCampaignBlockReason(campaign);
    if (blockReason) {
      return false;
    }
    return this.isProjectInMarketingCampaignScope(campaign, scopes, projectId);
  }) || null;

  if (!matched) {
    return null;
  }

  return {
    campaign: matched,
    scopes: scopes.filter((item) => item.campaign_id === matched.id),
  };
}

export function buildAppointmentRewardSummary(this: any, campaign: MarketingCampaignRow): AppointmentRewardSummary {
  const payload = this.parseAppointmentRewardConfigPayload(campaign.config_payload);
  return {
    reward_title: getAppointmentRewardTitle(campaign.reward_title),
    reward_claim_instruction: getAppointmentRewardClaimInstruction(campaign.reward_claim_instruction),
    display_title: payload.default_display_title || "预约到店可领取专属礼品",
    display_subtitle: payload.default_display_subtitle || "提交预约信息并到店即可参与活动",
  };
}

export async function getEffectiveProjectConfig(this: any, projectId: string) {
  const config = await this.getProjectConfig(projectId);
  const blockReason = this.getConfigBlockReason(config);
  return {
    raw: config,
    blockReason,
    effective: config && !blockReason ? this.buildEffectiveConfig(config) : null,
  };
}

export async function getEffectiveShareCampaignConfig(this: any, projectId: string, tenantId?: string | null) {
  const [matchedCampaign, legacyConfig] = await Promise.all([
    this.getMatchingMarketingCampaign(projectId, "share_assist", tenantId),
    this.getEffectiveProjectConfig(projectId),
  ]);

  if (matchedCampaign) {
    const blockReason = this.getMarketingCampaignBlockReason(matchedCampaign.campaign);
    return {
      source: "marketing_campaign" as const,
      rawCampaign: matchedCampaign.campaign,
      rawLegacyConfig: null,
      blockReason,
      effective: !blockReason
        ? await this.buildEffectiveConfigFromMarketingCampaign(matchedCampaign.campaign)
        : null,
    };
  }

  return {
    source: "legacy_project_config" as const,
    rawCampaign: null,
    rawLegacyConfig: legacyConfig.raw,
    blockReason: legacyConfig.blockReason,
    effective: legacyConfig.effective,
  };
}
