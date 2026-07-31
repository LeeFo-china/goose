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

export async function loadRecentImageProjectLog(this: any, projectId: string, scopeTenantId?: string | null) {
  const tenantId = scopeTenantId ?? await this.getProjectTenantId(projectId);

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("id, tenant_id, project_id, stage_code, node_name, content, images, created_at")
    .eq("project_id", projectId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw Errors.dbError("查询项目施工日志失败", error);
  }

  const logs = (data || []) as CustomerProjectLogRow[];
  return logs.find((item) => normalizeProjectLogImages(item.images).length > 0) || null;
}

export async function requestAiCopies(this: any, 
  context: CustomerProjectLogShareContext,
  input: GenerateCustomerProjectLogShareCopyInput,
) {
  try {
    const result = await aiGateway.chat({
      sceneCode: "customer_log_share_copy",
      tenantId: context.tenant_id,
      temperature: 0.8,
      responseFormat: "json_object",
      timeoutMs: 30000,
      messages: [
        {
          role: "system",
          content: "你是装修项目分享文案助手。",
        },
        {
          role: "user",
          content: buildCopyPrompt(context, input),
        },
      ],
    });
    return parseCopiesResult(result.content, context, input.length);
  } catch {
    return parseCopiesResult("", context, input.length);
  }
}

export async function ensureShareCampaign(this: any, 
  context: CustomerProjectLogShareContext,
  input?: CreateCustomerProjectLogShareCampaignInput,
) {
  const configResult = await this.getEffectiveShareCampaignConfig(context.project_id);
  if (!configResult.effective) {
    this.throwConfigBlocked(configResult.blockReason || "config_missing");
  }

  if (!configResult.effective.allow_create_when_existing_active) {
    const existingProjectActive = await customerProjectLogShareCampaignRepository.findActiveByProject(
      context.project_id,
    );
    if (existingProjectActive && existingProjectActive.log_id !== context.log_id) {
      const existingCampaign = await this.ensureCampaignPhase2Metadata(existingProjectActive);
      throw Errors.business(
        409,
        "当前项目已有进行中的助力活动",
        ErrorCodes.SHARE_CAMPAIGN_CONFIG_BLOCKED,
        {
          block_reason: "existing_active_campaign",
          campaign_id: existingCampaign.id,
          share_token: existingCampaign.share_token,
          log_id: existingCampaign.log_id,
          status: existingCampaign.status,
          reward_claim_status: existingCampaign.reward_claim_status,
        },
      );
    }
  }

  const existing = await customerProjectLogShareCampaignRepository.findActiveByOwner({
    customer_id: context.customer_id,
    project_id: context.project_id,
    log_id: context.log_id,
  });

  if (existing) {
    return existing;
  }

  try {
    return await customerProjectLogShareCampaignRepository.create({
      campaign_id: configResult.effective.campaign_id,
      campaign_type: configResult.effective.campaign_type,
      share_token: buildShareToken(),
      customer_id: context.customer_id,
      project_id: context.project_id,
      log_id: context.log_id,
      config_id: configResult.effective.config_id,
      channel: input?.channel ?? "timeline",
      target_assist_count: configResult.effective.target_assist_count,
      reward_title: configResult.effective.reward_title,
      reward_remark: configResult.effective.reward_remark,
      reward_claim_instruction: configResult.effective.reward_claim_instruction,
      reward_claim_channel: configResult.effective.reward_claim_channel,
      valid_until: configResult.effective.valid_until,
      poster_generated_at: new Date().toISOString(),
    });
  } catch {
    const fallback = await customerProjectLogShareCampaignRepository.findActiveByOwner({
      customer_id: context.customer_id,
      project_id: context.project_id,
      log_id: context.log_id,
    });
    if (fallback) {
      return fallback;
    }

    throw Errors.dbError("创建分享活动失败");
  }
}

export async function getCampaignByToken(this: any, shareToken: string) {
  const campaign = await customerProjectLogShareCampaignRepository.findByShareToken(
    normalizeShareToken(shareToken),
  );
  if (!campaign) {
    throw Errors.badRequest("分享活动不存在");
  }

  return campaign;
}

export async function resolveShareCampaignForOwnedLog(this: any, input: {
  authUserId: string;
  projectId: string;
  logId: string;
  shareToken?: string;
  channel?: string;
}) {
  const context = await this.getOwnedProjectLogContext(
    input.authUserId,
    input.projectId,
    input.logId,
  );

  if (input.shareToken) {
    const campaign = await this.getCampaignByToken(input.shareToken);
    if (
      campaign.customer_id !== context.customer_id
      || campaign.project_id !== context.project_id
      || campaign.log_id !== context.log_id
    ) {
      throw Errors.badRequest("分享活动与当前日志不匹配");
    }

    return { context, campaign };
  }

  const campaign = await this.ensureShareCampaign(context, {
    channel: input.channel === "timeline" ? "timeline" : "timeline",
  });
  return { context, campaign };
}

export async function resolveOptionalShareCampaignForOwnedLog(this: any, input: {
  authUserId: string;
  projectId: string;
  logId: string;
  shareToken?: string;
}) {
  const context = await this.getOwnedProjectLogContext(
    input.authUserId,
    input.projectId,
    input.logId,
  );

  if (input.shareToken) {
    const campaign = await customerProjectLogShareCampaignRepository.findByShareToken(
      normalizeShareToken(input.shareToken),
    );
    if (
      campaign
      && campaign.customer_id === context.customer_id
      && campaign.project_id === context.project_id
      && campaign.log_id === context.log_id
    ) {
      return {
        context,
        campaign: await this.ensureCampaignPhase2Metadata(campaign),
      };
    }

    return { context, campaign: null };
  }

  const existing = await customerProjectLogShareCampaignRepository.findActiveByOwner({
    customer_id: context.customer_id,
    project_id: context.project_id,
    log_id: context.log_id,
  });

  return {
    context,
    campaign: existing ? await this.ensureCampaignPhase2Metadata(existing) : null,
  };
}

export async function buildCampaignPublicDetail(this: any, shareToken: string) {
  const campaign = await this.getCampaignByToken(shareToken);
  const owner = await this.getCustomerById(campaign.customer_id);
  const userProfile = await this.getUserProfileByAuthUserId(owner.user_id);
  const { data: projectData, error: projectError } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select(`
      id,
      tenant_id,
      name,
      status,
      style_tags,
      property:properties!projects_property_id_fkey(
        community,
        building_info
      )
    `)
    .eq("id", campaign.project_id)
    .maybeSingle();

  if (projectError) {
    throw Errors.dbError("查询分享项目失败", projectError);
  }

  if (!projectData) {
    throw Errors.badRequest("分享活动对应项目不存在");
  }

  const { data: logData, error: logError } = await SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("id, tenant_id, project_id, stage_code, node_name, content, images, created_at")
    .eq("id", campaign.log_id)
    .eq("tenant_id", (projectData as unknown as CustomerProjectRow).tenant_id)
    .maybeSingle();

  if (logError) {
    throw Errors.dbError("查询分享日志失败", logError);
  }

  if (!logData) {
    throw Errors.badRequest("分享活动对应日志不存在");
  }

  const project = projectData as unknown as CustomerProjectRow;
  const log = logData as CustomerProjectLogRow;
  const property = normalizeRelation(project.property, {
    community: null,
    building_info: null,
  });
  const stageCode = isProjectLogStageCode(log.stage_code) ? log.stage_code : null;

  return {
    campaign,
    customer_nickname: userProfile?.nickname || owner.name || "业主",
    project_name: project.name,
    project_style_tags: normalizeStringArray(project.style_tags),
    property_community: typeof property.community === "string" ? property.community : null,
    property_building_info: typeof property.building_info === "string"
      ? property.building_info
      : null,
    stage_code: stageCode,
    stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
    node_name: log.node_name,
    log_content: log.content,
    log_images: normalizeProjectLogImages(log.images),
  };
}
