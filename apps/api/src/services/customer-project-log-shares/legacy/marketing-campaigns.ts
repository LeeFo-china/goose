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

export async function getMarketingCampaignTemplateOrThrow(this: any, id: string) {
  const template = await marketingCampaignTemplateRepository.findById(id);
  if (!template) {
    throw Errors.business(404, "营销模板不存在", ErrorCodes.MARKETING_TEMPLATE_NOT_FOUND);
  }
  return template;
}

export async function resolveMarketingCampaignCreateInput(this: any, 
  input: CreateMarketingCampaignInput,
  template: MarketingCampaignTemplateRow | null,
): Promise<MarketingCampaignUpsertInput> {
  const templatePayload = template
    ? await this.buildNormalizedMarketingCampaignConfigPayload(
      template.campaign_type,
      template.config_payload,
    )
    : null;

  const campaignType = template?.campaign_type ?? input.campaign_type;
  const targetScopeType = input.target_scope_type
    ?? template?.default_target_scope_type
    ?? "all_projects";

  const resolved: MarketingCampaignUpsertInput = {
    campaign_type: campaignType,
    name: input.name?.trim() || template?.name || "未命名营销活动",
    enabled: typeof input.enabled === "boolean"
      ? input.enabled
      : template
        ? template.status !== "disabled" && template.enabled
        : true,
    status: input.status ?? "draft",
    target_scope_type: targetScopeType,
    valid_from: input.valid_from ?? null,
    valid_until: input.valid_until ?? null,
    auto_close_on_expire: typeof input.auto_close_on_expire === "boolean"
      ? input.auto_close_on_expire
      : true,
    reward_title: input.reward_title ?? template?.reward_title ?? null,
    reward_remark: input.reward_remark ?? template?.reward_remark ?? null,
    reward_claim_instruction: input.reward_claim_instruction ?? template?.reward_claim_instruction ?? null,
    reward_claim_channel: input.reward_claim_channel ?? template?.reward_claim_channel ?? null,
    exclude_project_ids: input.exclude_project_ids ?? [],
    include_project_ids: input.include_project_ids ?? [],
    config_payload: campaignType === "appointment_reward"
      ? {
        achievement_mode: (input.config_payload as Partial<AppointmentRewardConfigPayload> | undefined)?.achievement_mode
          ?? (templatePayload as AppointmentRewardConfigPayload | null)?.achievement_mode
          ?? "appointment_submit",
        allow_one_active_per_customer: (input.config_payload as Partial<AppointmentRewardConfigPayload> | undefined)?.allow_one_active_per_customer
          ?? (templatePayload as AppointmentRewardConfigPayload | null)?.allow_one_active_per_customer
          ?? true,
        default_display_title: (input.config_payload as Partial<AppointmentRewardConfigPayload> | undefined)?.default_display_title
          ?? (templatePayload as AppointmentRewardConfigPayload | null)?.default_display_title
          ?? null,
        default_display_subtitle: (input.config_payload as Partial<AppointmentRewardConfigPayload> | undefined)?.default_display_subtitle
          ?? (templatePayload as AppointmentRewardConfigPayload | null)?.default_display_subtitle
          ?? null,
      }
      : {
        target_assist_count: (input.config_payload as Partial<ShareAssistConfigPayload> | undefined)?.target_assist_count
          ?? (templatePayload as ShareAssistConfigPayload | null)?.target_assist_count
          ?? await getCustomerProjectLogShareTargetAssistCount(),
        allow_create_when_existing_active: (input.config_payload as Partial<ShareAssistConfigPayload> | undefined)?.allow_create_when_existing_active
          ?? (templatePayload as ShareAssistConfigPayload | null)?.allow_create_when_existing_active
          ?? false,
        default_display_title: (input.config_payload as Partial<ShareAssistConfigPayload> | undefined)?.default_display_title
          ?? (templatePayload as ShareAssistConfigPayload | null)?.default_display_title
          ?? null,
        default_display_subtitle: (input.config_payload as Partial<ShareAssistConfigPayload> | undefined)?.default_display_subtitle
          ?? (templatePayload as ShareAssistConfigPayload | null)?.default_display_subtitle
          ?? null,
      },
  };

  if (resolved.target_scope_type === "project_list" && !resolved.include_project_ids.length) {
    throw Errors.badRequest("项目范围为指定项目时必须提供 include_project_ids");
  }

  return resolved;
}

export function buildMarketingCampaignScopeRows(this: any, 
  input: MarketingCampaignUpsertInput,
) {
  if (input.target_scope_type === "project_list") {
    return input.include_project_ids.map((project_id) => ({
      scope_mode: "include" as const,
      project_id,
    }));
  }

  return input.exclude_project_ids.map((project_id) => ({
    scope_mode: "exclude" as const,
    project_id,
  }));
}

export async function listMarketingCampaigns(this: any, 
  authContext: AuthContext,
  query: MarketingCampaignListQuery,
) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.read",
  );
  const result = await marketingCampaignRepository.list({
    tenantId,
    campaignType: query.campaign_type,
    status: query.status,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize,
  });

  const scopes = await marketingCampaignRepository.listScopesByCampaignIds(
    result.list.map((item: any) => item.id),
    tenantId,
  );

  const visible = result.list.filter((campaign) =>
    this.campaignVisibleToEmployee(
      campaign,
      scopes.filter((item) => item.campaign_id === campaign.id),
      visibleProjectIds,
    )
  );

  return {
    list: visible.map((campaign) => ({
      id: campaign.id,
      campaign_type: campaign.campaign_type,
      name: campaign.name,
      status: campaign.status,
      enabled: campaign.enabled,
      target_scope_type: campaign.target_scope_type,
      valid_from: campaign.valid_from,
      valid_until: campaign.valid_until,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: visible.length,
      totalPages: visible.length ? Math.ceil(visible.length / query.pageSize) : 0,
    },
  };
}

export async function listMarketingCampaignTemplates(this: any, 
  query: MarketingCampaignTemplateListQuery,
) {
  const result = await marketingCampaignTemplateRepository.list({
    campaignType: query.campaign_type,
    status: query.status,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    list: result.list.map((template) => ({
      id: template.id,
      campaign_type: template.campaign_type,
      name: template.name,
      description: template.description,
      status: template.status,
      enabled: template.enabled,
      is_builtin: template.is_builtin,
      default_target_scope_type: template.default_target_scope_type,
      reward_title: template.reward_title,
      reward_claim_channel: template.reward_claim_channel,
      updated_at: template.updated_at,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      totalPages: result.total ? Math.ceil(result.total / query.pageSize) : 0,
    },
  };
}

export async function getMarketingCampaignTemplateDetail(this: any, templateId: string) {
  const template = await this.getMarketingCampaignTemplateOrThrow(templateId);

  return {
    id: template.id,
    campaign_type: template.campaign_type,
    name: template.name,
    description: template.description,
    status: template.status,
    enabled: template.enabled,
    is_builtin: template.is_builtin,
    default_target_scope_type: template.default_target_scope_type,
    reward_title: template.reward_title,
    reward_remark: template.reward_remark,
    reward_claim_instruction: template.reward_claim_instruction,
    reward_claim_channel: template.reward_claim_channel,
    config_payload: await this.buildNormalizedMarketingCampaignConfigPayload(
      template.campaign_type,
      template.config_payload,
    ),
    created_at: template.created_at,
    updated_at: template.updated_at,
  };
}

export async function createMarketingCampaignTemplate(this: any, 
  authContext: AuthContext,
  input: CreateMarketingCampaignTemplateInput,
) {
  const normalizedEnabled = this.normalizeMarketingCampaignTemplateEnabled(input.status, input.enabled);
  const template = await marketingCampaignTemplateRepository.create({
    campaign_type: input.campaign_type,
    name: input.name,
    description: input.description ?? null,
    status: input.status,
    enabled: normalizedEnabled,
    is_builtin: input.is_builtin,
    default_target_scope_type: input.default_target_scope_type,
    reward_title: input.reward_title ?? null,
    reward_remark: input.reward_remark ?? null,
    reward_claim_instruction: input.reward_claim_instruction ?? null,
    reward_claim_channel: input.reward_claim_channel ?? null,
    config_payload: this.buildMarketingCampaignTemplateConfigPayload(input),
    created_by_employee_id: authContext.employeeId,
    updated_by_employee_id: authContext.employeeId,
  });

  return {
    id: template.id,
  };
}

export async function updateMarketingCampaignTemplate(this: any, 
  authContext: AuthContext,
  templateId: string,
  input: UpdateMarketingCampaignTemplateInput,
) {
  await this.getMarketingCampaignTemplateOrThrow(templateId);
  const normalizedEnabled = this.normalizeMarketingCampaignTemplateEnabled(input.status, input.enabled);

  await marketingCampaignTemplateRepository.update({
    id: templateId,
    campaign_type: input.campaign_type,
    name: input.name,
    description: input.description ?? null,
    status: input.status,
    enabled: normalizedEnabled,
    is_builtin: input.is_builtin,
    default_target_scope_type: input.default_target_scope_type,
    reward_title: input.reward_title ?? null,
    reward_remark: input.reward_remark ?? null,
    reward_claim_instruction: input.reward_claim_instruction ?? null,
    reward_claim_channel: input.reward_claim_channel ?? null,
    config_payload: this.buildMarketingCampaignTemplateConfigPayload(input),
    updated_by_employee_id: authContext.employeeId,
  });

  return this.getMarketingCampaignTemplateDetail(templateId);
}

export async function updateMarketingCampaignTemplateStatus(this: any, 
  authContext: AuthContext,
  templateId: string,
  input: MarketingCampaignTemplateStatusUpdateInput,
) {
  await this.getMarketingCampaignTemplateOrThrow(templateId);
  await marketingCampaignTemplateRepository.updateStatus(
    templateId,
    input.status,
    authContext.employeeId,
  );
  return this.getMarketingCampaignTemplateDetail(templateId);
}
