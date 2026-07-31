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

import { decideClaimVoucher } from "../claim-voucher-policy";

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

export async function ensureCampaignRewardMetadata(this: any, 
  campaign: CustomerProjectLogShareCampaignRow,
) {
  const nextRewardClaimStatus = campaign.reward_claim_status
    || (campaign.status === "reward_claimed" ? "claimed" : "unclaimed");
  const nextRewardClaimCode = campaign.reward_claim_code
    || (campaign.status === "achieved" || campaign.status === "reward_claimed"
      ? buildRewardClaimCode(campaign)
      : null);
  const nextRewardClaimInstruction = campaign.reward_claim_instruction
    || getDefaultRewardClaimInstruction(campaign.target_assist_count);
  const nextRewardClaimChannel = campaign.reward_claim_channel || "store";

  if (
    nextRewardClaimStatus === campaign.reward_claim_status
    && nextRewardClaimCode === campaign.reward_claim_code
    && nextRewardClaimInstruction === campaign.reward_claim_instruction
    && nextRewardClaimChannel === campaign.reward_claim_channel
  ) {
    return campaign;
  }

  return customerProjectLogShareCampaignRepository.updateRewardMetadata({
    id: campaign.id,
    reward_claim_status: nextRewardClaimStatus,
    reward_claim_code: nextRewardClaimCode,
    reward_claim_instruction: nextRewardClaimInstruction,
    reward_claim_channel: nextRewardClaimChannel,
  });
}

export function getVoucherExpiresAt(this: any, campaign: CustomerProjectLogShareCampaignRow) {
  if (campaign.reward_claim_voucher_expires_at) {
    return campaign.reward_claim_voucher_expires_at;
  }

  if (!campaign.achieved_at) {
    return null;
  }

  const base = new Date(campaign.achieved_at);
  if (Number.isNaN(base.getTime())) {
    return null;
  }

  base.setDate(base.getDate() + 7);
  return base.toISOString();
}

export function getRewardClaimVoucherStatus(this: any, 
  campaign: CustomerProjectLogShareCampaignRow,
): RewardClaimVoucherStatus | null {
  if (!campaign.reward_claim_voucher_token) {
    return null;
  }

  return decideClaimVoucher({
    hasVoucherToken: true,
    isClaimed:
      campaign.status === "reward_claimed"
      || campaign.reward_claim_status === "claimed",
    isClosed: campaign.status === "closed",
    isAchieved: this.isCampaignRewardClaimable(campaign),
    expiresAt: this.getVoucherExpiresAt(campaign),
  }).voucherStatus;
}

export function isCampaignRewardClaimable(this: any, campaign: CustomerProjectLogShareCampaignRow) {
  if (campaign.reward_claim_status === "claimed" || campaign.status === "reward_claimed") {
    return false;
  }

  return Boolean(
    campaign.status === "achieved"
    || campaign.achieved_at
    || campaign.assist_count >= campaign.target_assist_count,
  );
}

export function buildRewardClaimVoucherPayload(this: any, 
  campaign: CustomerProjectLogShareCampaignRow,
): RewardClaimVoucherPayload | null {
  const status = this.getRewardClaimVoucherStatus(campaign);
  if (!status || !campaign.reward_claim_voucher_token) {
    return null;
  }

  return {
    voucher_token: campaign.reward_claim_voucher_token,
    status,
    expires_at: this.getVoucherExpiresAt(campaign),
  };
}

export async function ensureCampaignRewardClaimVoucher(this: any, 
  campaign: CustomerProjectLogShareCampaignRow,
) {
  if (!this.isCampaignRewardClaimable(campaign) && campaign.status !== "reward_claimed") {
    return campaign;
  }

  const nextVoucherToken = campaign.reward_claim_voucher_token || buildRewardClaimVoucherToken();
  const nextVoucherExpiresAt = this.getVoucherExpiresAt(campaign);

  if (
    nextVoucherToken === campaign.reward_claim_voucher_token
    && nextVoucherExpiresAt === campaign.reward_claim_voucher_expires_at
  ) {
    return campaign;
  }

  return customerProjectLogShareCampaignRepository.updateRewardMetadata({
    id: campaign.id,
    reward_claim_voucher_token: nextVoucherToken,
    reward_claim_voucher_expires_at: nextVoucherExpiresAt,
  });
}

export function serializeRecentHelpers(this: any, 
  rows: Array<{
    helper_name: string | null;
    helper_avatar: string | null;
    created_at: string | null;
  }>,
): RecentHelperSummary[] {
  return rows.map((row) => ({
    helper_name: maskDisplayName(row.helper_name),
    helper_avatar: this.getImagePublicUrl(row.helper_avatar),
    assisted_at: row.created_at,
  }));
}

export async function getRecentHelpers(this: any, campaignId: string, limit: number) {
  const result = await customerProjectLogShareCampaignRepository.listValidAssists({
    campaign_id: campaignId,
    limit,
  });

  return this.serializeRecentHelpers(result.list);
}

export async function ensureCampaignPhase2Metadata(this: any, 
  campaign: CustomerProjectLogShareCampaignRow,
) {
  const withRewardMetadata = await this.ensureCampaignRewardMetadata(campaign);
  return this.ensureCampaignRewardClaimVoucher(withRewardMetadata);
}

export function buildEffectiveConfig(this: any, 
  config: ProjectShareCampaignConfigRow,
): EffectiveShareCampaignConfig {
  return {
    config_id: config.id,
    campaign_id: null,
    campaign_name: null,
    campaign_type: "share_assist",
    enabled: config.enabled,
    config_status: config.config_status,
    config_mode: config.config_mode,
    template_id: config.template_id,
    template_name: null,
    target_assist_count: config.target_assist_count,
    reward_title: config.reward_title?.trim() || buildDefaultConfigRewardTitle(config.target_assist_count),
    reward_remark: config.reward_remark?.trim() || DEFAULT_SHARE_REWARD_REMARK,
    reward_claim_instruction: config.reward_claim_instruction?.trim()
      || getDefaultRewardClaimInstruction(config.target_assist_count),
    reward_claim_channel: config.reward_claim_channel?.trim() || "store",
    valid_from: config.valid_from,
    valid_until: config.valid_until,
    auto_close_on_expire: config.auto_close_on_expire,
    allow_create_when_existing_active: config.allow_create_when_existing_active,
    default_display_title: config.default_display_title,
    default_display_subtitle: config.default_display_subtitle,
  };
}

export async function parseShareAssistConfigPayload(this: any, 
  payload: Record<string, unknown> | null,
): Promise<ShareAssistConfigPayload> {
  const defaultTargetAssistCount = await getCustomerProjectLogShareTargetAssistCount();
  const targetAssistCount = typeof payload?.target_assist_count === "number"
    ? payload.target_assist_count
    : defaultTargetAssistCount;

  return {
    target_assist_count: Number.isInteger(targetAssistCount) && targetAssistCount > 0
      ? targetAssistCount
      : defaultTargetAssistCount,
    allow_create_when_existing_active: Boolean(payload?.allow_create_when_existing_active),
    default_display_title: typeof payload?.default_display_title === "string"
      ? payload.default_display_title.trim() || null
      : null,
    default_display_subtitle: typeof payload?.default_display_subtitle === "string"
      ? payload.default_display_subtitle.trim() || null
      : null,
  };
}

export function parseAppointmentRewardConfigPayload(this: any, 
  payload: Record<string, unknown> | null,
): AppointmentRewardConfigPayload {
  const achievementMode = payload?.achievement_mode === "store_checkin"
    ? "store_checkin"
    : "appointment_submit";

  return {
    achievement_mode: achievementMode,
    allow_one_active_per_customer: payload?.allow_one_active_per_customer === false ? false : true,
    default_display_title: typeof payload?.default_display_title === "string"
      ? payload.default_display_title.trim() || null
      : null,
    default_display_subtitle: typeof payload?.default_display_subtitle === "string"
      ? payload.default_display_subtitle.trim() || null
      : null,
  };
}

export async function buildNormalizedMarketingCampaignConfigPayload(this: any, 
  campaignType: MarketingCampaignRow["campaign_type"] | MarketingCampaignTemplateRow["campaign_type"],
  payload: Record<string, unknown> | null,
) {
  return campaignType === "appointment_reward"
    ? this.parseAppointmentRewardConfigPayload(payload)
    : await this.parseShareAssistConfigPayload(payload);
}

export function normalizeMarketingCampaignTemplateEnabled(this: any, status: MarketingCampaignTemplateStatus, enabled: boolean) {
  return status === "disabled" ? false : enabled;
}

export async function buildMarketingCampaignTemplateSnapshot(this: any, 
  template: MarketingCampaignTemplateRow,
): Promise<MarketingCampaignTemplateSnapshot> {
  return {
    id: template.id,
    campaign_type: template.campaign_type,
    name: template.name,
    description: template.description,
    status: template.status,
    enabled: template.enabled,
    default_target_scope_type: template.default_target_scope_type,
    reward_title: template.reward_title,
    reward_remark: template.reward_remark,
    reward_claim_instruction: template.reward_claim_instruction,
    reward_claim_channel: template.reward_claim_channel,
    config_payload: await this.buildNormalizedMarketingCampaignConfigPayload(
      template.campaign_type,
      template.config_payload,
    ),
  };
}

export async function parseMarketingCampaignTemplateSnapshot(this: any, 
  value: Record<string, unknown> | null,
): Promise<MarketingCampaignTemplateSnapshot | null> {
  if (!value || typeof value !== "object") {
    return null;
  }

  const campaignType = value.campaign_type === "share_assist" || value.campaign_type === "appointment_reward"
    ? value.campaign_type
    : null;
  const status = value.status === "draft" || value.status === "active" || value.status === "disabled"
    ? value.status
    : null;
  const scopeType = value.default_target_scope_type === "project_list" ? "project_list" : "all_projects";

  if (!campaignType || !status || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }

  return {
    id: value.id,
    campaign_type: campaignType,
    name: value.name,
    description: typeof value.description === "string" ? value.description : null,
    status,
    enabled: Boolean(value.enabled),
    default_target_scope_type: scopeType,
    reward_title: typeof value.reward_title === "string" ? value.reward_title : null,
    reward_remark: typeof value.reward_remark === "string" ? value.reward_remark : null,
    reward_claim_instruction: typeof value.reward_claim_instruction === "string"
      ? value.reward_claim_instruction
      : null,
    reward_claim_channel: typeof value.reward_claim_channel === "string"
      ? value.reward_claim_channel
      : null,
    config_payload: await this.buildNormalizedMarketingCampaignConfigPayload(
      campaignType,
      typeof value.config_payload === "object" && value.config_payload !== null
        ? value.config_payload as Record<string, unknown>
        : null,
    ),
  };
}

export function buildMarketingCampaignTemplateConfigPayload(this: any, 
  input:
    | CreateMarketingCampaignTemplateInput
    | UpdateMarketingCampaignTemplateInput
    | MarketingCampaignUpsertInput,
) {
  if (input.campaign_type === "appointment_reward") {
    const payload = input.config_payload as AppointmentRewardConfigPayload;
    return {
      achievement_mode: payload.achievement_mode,
      allow_one_active_per_customer: payload.allow_one_active_per_customer,
      default_display_title: payload.default_display_title ?? null,
      default_display_subtitle: payload.default_display_subtitle ?? null,
    };
  }

  const payload = input.config_payload as ShareAssistConfigPayload;
  return {
    target_assist_count: payload.target_assist_count,
    allow_create_when_existing_active: payload.allow_create_when_existing_active,
    default_display_title: payload.default_display_title ?? null,
    default_display_subtitle: payload.default_display_subtitle ?? null,
  };
}

export async function buildEffectiveConfigFromMarketingCampaign(this: any, 
  campaign: MarketingCampaignRow,
): Promise<EffectiveShareCampaignConfig> {
  const payload = await this.parseShareAssistConfigPayload(campaign.config_payload);

  return {
    config_id: null,
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    campaign_type: campaign.campaign_type,
    enabled: campaign.enabled,
    config_status: campaign.status,
    config_mode: "custom",
    template_id: null,
    template_name: null,
    target_assist_count: payload.target_assist_count,
    reward_title: campaign.reward_title?.trim() || buildDefaultConfigRewardTitle(payload.target_assist_count),
    reward_remark: campaign.reward_remark?.trim() || DEFAULT_SHARE_REWARD_REMARK,
    reward_claim_instruction: campaign.reward_claim_instruction?.trim()
      || getDefaultRewardClaimInstruction(payload.target_assist_count),
    reward_claim_channel: campaign.reward_claim_channel?.trim() || "store",
    valid_from: campaign.valid_from,
    valid_until: campaign.valid_until,
    auto_close_on_expire: campaign.auto_close_on_expire,
    allow_create_when_existing_active: payload.allow_create_when_existing_active,
    default_display_title: payload.default_display_title ?? null,
    default_display_subtitle: payload.default_display_subtitle ?? null,
  };
}
