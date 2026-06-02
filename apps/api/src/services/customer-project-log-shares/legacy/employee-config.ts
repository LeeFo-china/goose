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

export async function getEmployeeProjectCampaignConfig(this: any, projectId: string) {
  const config = await this.getProjectConfig(projectId);
  const summary = await customerProjectLogShareCampaignRepository.countByProjectStatus(projectId);

  return {
    project_id: projectId,
    has_config: Boolean(config),
    config: config
      ? {
        config_id: config.id,
        enabled: config.enabled,
        config_status: config.config_status,
        config_mode: config.config_mode,
        template_id: config.template_id,
        template_name: null,
        target_assist_count: config.target_assist_count,
        reward_title: config.reward_title?.trim()
          || buildDefaultConfigRewardTitle(config.target_assist_count),
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
      }
      : null,
    summary,
  };
}

export async function saveEmployeeProjectCampaignConfig(this: any, 
  projectId: string,
  employeeId: string | null,
  input: PutProjectShareCampaignConfigInput,
) {
  const config = await projectShareCampaignConfigRepository.upsertByProjectId({
    project_id: projectId,
    config_status: input.config_status,
    enabled: input.enabled,
    template_id: input.template_id ?? null,
    config_mode: input.config_mode,
    target_assist_count: input.target_assist_count,
    reward_title: input.reward_title ?? null,
    reward_remark: input.reward_remark ?? null,
    reward_claim_instruction: input.reward_claim_instruction ?? null,
    reward_claim_channel: input.reward_claim_channel ?? null,
    valid_from: input.valid_from ?? null,
    valid_until: input.valid_until ?? null,
    auto_close_on_expire: input.auto_close_on_expire,
    allow_create_when_existing_active: input.allow_create_when_existing_active,
    default_display_title: input.default_display_title ?? null,
    default_display_subtitle: input.default_display_subtitle ?? null,
    employee_id: employeeId,
  });

  return {
    config_id: config.id,
    project_id: config.project_id,
    enabled: config.enabled,
    config_status: config.config_status,
    config_mode: config.config_mode,
    updated_at: config.updated_at,
  };
}

export async function updateEmployeeProjectCampaignConfigStatus(this: any, 
  projectId: string,
  employeeId: string | null,
  input: PostProjectShareCampaignConfigStatusInput,
) {
  const updated = await projectShareCampaignConfigRepository.updateStatusByProjectId(
    projectId,
    input.config_status,
    employeeId,
  );

  if (!updated) {
    throw Errors.business(
      404,
      "项目助力活动配置不存在",
      ErrorCodes.SHARE_CAMPAIGN_CONFIG_NOT_FOUND,
    );
  }

  return {
    config_id: updated.id,
    project_id: updated.project_id,
    enabled: updated.enabled,
    config_status: updated.config_status,
    updated_at: updated.updated_at,
  };
}

export async function listEmployeeShareCampaigns(this: any, 
  authContext: AuthContext,
  query: EmployeeShareCampaignListQuery,
) {
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.read",
  );

  const result = await customerProjectLogShareCampaignRepository.listForEmployee({
    projectIds: visibleProjectIds,
    projectId: query.projectId,
    customerId: query.customerId,
    status: query.status,
    rewardClaimStatus: query.rewardClaimStatus,
    keyword: query.keyword,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    list: result.list.map((item: any) => ({
      campaign_id: item.instance_id,
      marketing_campaign_id: item.campaign_id,
      campaign_type: item.campaign_type,
      project_id: item.project_id,
      project_name: item.project_name,
      customer_id: item.customer_id,
      customer_name: item.customer_name,
      log_id: item.log_id,
      log_title: item.log_title,
      status: item.status,
      reward_claim_status: item.reward_claim_status,
      assist_count: item.assist_count,
      target_assist_count: item.target_assist_count,
      reward_title: item.reward_title,
      reward_remark: item.reward_remark,
      share_token: item.share_token,
      started_at: item.started_at,
      valid_until: item.valid_until,
      last_assisted_at: item.last_assisted_at,
      reward_claim_code: item.reward_claim_code,
      reward_claim_instruction: item.reward_claim_instruction,
      reward_claim_channel: item.reward_claim_channel,
      reward_claimed_at: item.reward_claimed_at,
      reward_claim_voucher_token: item.reward_claim_voucher_token,
      reward_claim_voucher_expires_at: item.reward_claim_voucher_expires_at,
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

export async function getScopeProjectMap(this: any, projectIds: string[]) {
  if (!projectIds.length) {
    return new Map<string, { id: string; name: string | null }>();
  }

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("id,name")
    .in("id", projectIds);
  if (error) {
    throw Errors.dbError("查询活动范围项目失败", error);
  }

  return new Map(
    ((data || []) as Array<{ id: string; name: string | null }>).map((item: any) => [item.id, item]),
  );
}

export async function getProjectTenantId(this: any, projectId: string) {
  const cached = this.getHotCacheEntry(this.projectTenantCache, projectId);
  if (cached) {
    return cached.value;
  }

  const inFlight = this.projectTenantInFlight.get(projectId);
  if (inFlight) {
    return inFlight;
  }

  const request = this.loadProjectTenantId(projectId)
    .then((result: any) => {
      this.setHotCacheValue(this.projectTenantCache, projectId, result);
      return result;
    })
    .finally(() => {
      if (this.projectTenantInFlight.get(projectId) === request) {
        this.projectTenantInFlight.delete(projectId);
      }
    });
  this.projectTenantInFlight.set(projectId, request);
  return request;
}

export async function loadProjectTenantId(this: any, projectId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询项目租户失败", error);
  }

  return (data as { tenant_id?: string | null } | null)?.tenant_id ?? null;
}

export async function assertMarketingScopeProjectsAccessible(this: any, input: {
  authContext: AuthContext;
  projectIds: string[];
  permissionCode: string;
}) {
  const uniqueProjectIds = Array.from(new Set(input.projectIds.filter(Boolean)));
  if (!uniqueProjectIds.length) {
    return;
  }

  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    input.authContext,
    input.permissionCode,
  );

  if (visibleProjectIds) {
    const invalid = uniqueProjectIds.some((projectId) => !visibleProjectIds.includes(projectId));
    if (invalid) {
      throw Errors.forbidden();
    }
    return;
  }

  const tenantId = input.authContext.tenantId;
  if (!tenantId) {
    return;
  }

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", uniqueProjectIds);

  if (error) {
    throw Errors.dbError("校验营销活动项目范围失败", error);
  }

  if ((data || []).length !== uniqueProjectIds.length) {
    throw Errors.forbidden();
  }
}

export function campaignVisibleToEmployee(this: any, 
  campaign: MarketingCampaignRow,
  scopes: MarketingCampaignProjectScopeRow[],
  visibleProjectIds: string[] | null,
) {
  if (visibleProjectIds === null) {
    return true;
  }

  if (!visibleProjectIds.length) {
    return false;
  }

  if (campaign.target_scope_type === "project_list") {
    const includeIds = scopes
      .filter((item) => item.scope_mode === "include")
      .map((item: any) => item.project_id);
    return includeIds.some((item) => visibleProjectIds.includes(item));
  }

  const excluded = new Set(
    scopes.filter((item) => item.scope_mode === "exclude").map((item: any) => item.project_id),
  );
  return visibleProjectIds.some((item) => !excluded.has(item));
}

export async function getMarketingCampaignOrThrow(this: any, id: string, tenantId?: string | null) {
  const campaign = await marketingCampaignRepository.findById(id, tenantId);
  if (!campaign) {
    throw Errors.business(404, "营销活动不存在", ErrorCodes.SHARE_CAMPAIGN_NOT_FOUND);
  }
  return campaign;
}

export function buildAppointmentRewardVoucherPayload(this: any, 
  campaign: CustomerAppointmentRewardCampaignRow,
) {
  if (!campaign.reward_claim_voucher_token) {
    return null;
  }

  const status = campaign.reward_claim_status === "claimed"
    ? "claimed"
    : campaign.status === "closed"
      ? "expired"
      : "active";

  return {
    voucher_token: campaign.reward_claim_voucher_token,
    status,
    expires_at: null as string | null,
  };
}

export async function ensureAppointmentRewardMetadata(this: any, 
  campaign: CustomerAppointmentRewardCampaignRow,
) {
  if (campaign.status !== "achieved" && campaign.status !== "reward_claimed") {
    return campaign;
  }

  const rewardClaimCode = campaign.reward_claim_code || buildRewardClaimCode(campaign);
  const voucherToken = campaign.reward_claim_voucher_token || buildRewardClaimVoucherToken();

  if (
    rewardClaimCode === campaign.reward_claim_code
    && voucherToken === campaign.reward_claim_voucher_token
  ) {
    return campaign;
  }

  return customerAppointmentRewardCampaignRepository.update({
    id: campaign.id,
    reward_claim_code: rewardClaimCode,
    reward_claim_voucher_token: voucherToken,
  });
}
