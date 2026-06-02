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

export async function buildViewerAssistInfo(this: any, 
  campaign: CustomerProjectLogShareCampaignRow,
  owner: CampaignOwnerRow,
  viewer?: { authUserId?: string | null; openid?: string | null },
): Promise<ViewerAssistInfo> {
  const isAuthenticated = Boolean(viewer?.authUserId);
  if (!isAuthenticated || !viewer?.authUserId) {
    return {
      is_authenticated: false,
      can_assist: false,
      assist_block_reason: "not_authenticated",
      has_assisted: false,
      is_owner: false,
    };
  }

  const isOwner = Boolean(owner.user_id && owner.user_id === viewer.authUserId);
  if (isOwner) {
    return {
      is_authenticated: true,
      can_assist: false,
      assist_block_reason: "owner_self",
      has_assisted: false,
      is_owner: true,
    };
  }

  if (campaign.status === "achieved") {
    return {
      is_authenticated: true,
      can_assist: false,
      assist_block_reason: "campaign_achieved",
      has_assisted: false,
      is_owner: false,
    };
  }

  if (campaign.status === "reward_claimed") {
    return {
      is_authenticated: true,
      can_assist: false,
      assist_block_reason: "reward_claimed",
      has_assisted: false,
      is_owner: false,
    };
  }

  if (campaign.status === "closed") {
    return {
      is_authenticated: true,
      can_assist: false,
      assist_block_reason: "campaign_closed",
      has_assisted: false,
      is_owner: false,
    };
  }

  const existingAssist = await customerProjectLogShareCampaignRepository.findAssist({
    campaign_id: campaign.id,
    helper_auth_user_id: viewer.authUserId,
    helper_openid: viewer.openid ?? null,
  });

  if (existingAssist) {
    return {
      is_authenticated: true,
      can_assist: false,
      assist_block_reason: "already_assisted",
      has_assisted: true,
      is_owner: false,
    };
  }

  return {
    is_authenticated: true,
    can_assist: true,
    assist_block_reason: null,
    has_assisted: false,
    is_owner: false,
  };
}

export function buildAssistBlockedError(this: any, input: {
  statusCode: number;
  code: string;
  message: string;
  campaign: CustomerProjectLogShareCampaignRow;
  reason: NonNullable<ViewerAssistInfo["assist_block_reason"]>;
}) {
  return Errors.business(
    input.statusCode,
    input.message,
    input.code,
    {
      assist_result: "blocked",
      assist_block_reason: input.reason,
      campaign_id: input.campaign.id,
      share_token: input.campaign.share_token,
      status: input.campaign.status,
      reward_claim_status: input.campaign.reward_claim_status,
      assist_count: input.campaign.assist_count,
      target_assist_count: input.campaign.target_assist_count,
      remaining_count: Math.max(
        input.campaign.target_assist_count - input.campaign.assist_count,
        0,
      ),
    },
  );
}

export async function getOwnedProjectLogContext(this: any, 
  authUserId: string,
  projectId: string,
  logId: string,
): Promise<CustomerProjectLogShareContext> {
  const customer = await this.getCustomerByAuthUserId(authUserId);
  const { data: projectData, error: projectError } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select(`
      id,
      tenant_id,
      customer_id,
      name,
      status,
      address,
      style_tags,
      property:properties!projects_property_id_fkey(
        community,
        building_info
      )
    `)
    .eq("id", projectId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (projectError) {
    throw Errors.dbError("查询客户项目失败", projectError);
  }

  if (!projectData) {
    throw Errors.forbidden();
  }

  const [assignees, logResult] = await Promise.all([
    projectMemberService.listPrimaryAssigneesByProjectId(projectId),
    SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("id, tenant_id, project_id, stage_code, node_name, content, images, created_at")
    .eq("id", logId)
    .eq("project_id", projectId)
    .eq("tenant_id", (projectData as unknown as CustomerProjectRow).tenant_id)
    .maybeSingle(),
  ]);
  const { data: logData, error: logError } = logResult;

  if (logError) {
    throw Errors.dbError("查询施工日志失败", logError);
  }

  if (!logData) {
    throw Errors.badRequest("施工日志不存在");
  }

  const project = projectData as unknown as CustomerProjectRow;
  const log = logData as CustomerProjectLogRow;
  const property = normalizeRelation(project.property, {
    community: null,
    building_info: null,
  });
  const designer = assignees.find((item) => item.role_code === "designer");
  const status = isProjectStatus(project.status) ? project.status : null;
  const stageCode = isProjectLogStageCode(log.stage_code) ? log.stage_code : null;

  return {
    tenant_id: project.tenant_id,
    customer_id: customer.id,
    customer_name: customer.name,
    project_id: project.id,
    project_name: project.name,
    project_status: status,
    project_status_label: status ? ProjectStatusConfig[status].label : null,
    project_address: project.address,
    project_style_tags: normalizeStringArray(project.style_tags),
    property_community: typeof property.community === "string" ? property.community : null,
    property_building_info: typeof property.building_info === "string"
      ? property.building_info
      : null,
    designer_name: designer?.employee?.name ?? null,
    log_id: log.id,
    stage_code: stageCode,
    stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
    node_name: log.node_name,
    log_content: log.content,
    log_images: normalizeProjectLogImages(log.images),
    created_at: log.created_at,
  };
}

export async function getOwnedProject(this: any, 
  authUserId: string,
  projectId: string,
  scope?: CustomerProjectScope,
) {
  const cacheKey = `${this.customerProjectScopeCacheKey(authUserId, scope)}:${projectId}`;
  const cached = this.getHotCacheValue(this.ownedProjectCache, cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = this.ownedProjectInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = this.loadOwnedProject(authUserId, projectId, scope)
    .then((result: any) => {
      this.setHotCacheValue(this.ownedProjectCache, cacheKey, result);
      return result;
    })
    .finally(() => {
      if (this.ownedProjectInFlight.get(cacheKey) === request) {
        this.ownedProjectInFlight.delete(cacheKey);
      }
    });
  this.ownedProjectInFlight.set(cacheKey, request);
  return request;
}

export async function loadOwnedProject(this: any, 
  authUserId: string,
  projectId: string,
  scope?: CustomerProjectScope,
) {
  if (scope?.customerId) {
    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, customer_id, tenant_id, name")
      .eq("id", projectId)
      .eq("customer_id", scope.customerId);

    if (scope.tenantId) {
      query = query.eq("tenant_id", scope.tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户项目失败", error);
    }

    if (!data) {
      throw Errors.forbidden();
    }

    const project = data as { id: string; customer_id: string; tenant_id: string | null; name: string | null };
    return {
      customer: {
        id: scope.customerId,
        tenant_id: project.tenant_id,
        name: null,
        user_id: authUserId,
      },
      project: {
        id: project.id,
        customer_id: project.customer_id,
        name: project.name,
      },
    };
  }

  const customer = await this.getCustomerByAuthUserId(authUserId);
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("id, customer_id, name")
    .eq("id", projectId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询客户项目失败", error);
  }

  if (!data) {
    throw Errors.forbidden();
  }

  return {
    customer,
    project: data as { id: string; customer_id: string; name: string | null },
  };
}

export async function getOwnedProjectById(this: any, projectId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("id, customer_id, name")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询项目失败", error);
  }

  if (!data) {
    throw Errors.badRequest("项目不存在");
  }

  return data as { id: string; customer_id: string; name: string | null };
}

export async function getOwnedCampaignById(this: any, authUserId: string, campaignId: string) {
  const customer = await this.getCustomerByAuthUserId(authUserId);
  const campaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
  if (!campaign || campaign.customer_id !== customer.id) {
    throw Errors.forbidden();
  }

  return {
    customer,
    campaign: await this.ensureCampaignPhase2Metadata(campaign),
  };
}

export async function getProjectLogById(this: any, logId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("id, tenant_id, project_id, stage_code, node_name, content, images, created_at")
    .eq("id", logId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询施工日志失败", error);
  }

  if (!data) {
    throw Errors.badRequest("施工日志不存在");
  }

  return data as CustomerProjectLogRow;
}

export async function getRecentImageProjectLog(this: any, projectId: string, tenantId?: string | null) {
  const cached = this.getHotCacheEntry(this.recentImageProjectLogCache, projectId);
  if (cached) {
    return cached.value;
  }

  const inFlight = this.recentImageProjectLogInFlight.get(projectId);
  if (inFlight) {
    return inFlight;
  }

  const request = this.loadRecentImageProjectLog(projectId, tenantId)
    .then((result: any) => {
      this.setHotCacheValue(this.recentImageProjectLogCache, projectId, result);
      return result;
    })
    .finally(() => {
      if (this.recentImageProjectLogInFlight.get(projectId) === request) {
        this.recentImageProjectLogInFlight.delete(projectId);
      }
    });
  this.recentImageProjectLogInFlight.set(projectId, request);
  return request;
}
