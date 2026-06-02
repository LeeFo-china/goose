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

export async function getMarketingCampaignDetail(this: any, authContext: AuthContext, campaignId: string) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.read",
  );
  const campaign = await this.getMarketingCampaignOrThrow(campaignId, tenantId);
  const scopes = await marketingCampaignRepository.listScopesByCampaignId(campaignId, tenantId);

  if (!this.campaignVisibleToEmployee(campaign, scopes, visibleProjectIds)) {
    throw Errors.forbidden();
  }

  const templateSummary = campaign.template_id
    ? await marketingCampaignTemplateRepository.findById(campaign.template_id)
    : null;
  const templateSnapshot = await this.parseMarketingCampaignTemplateSnapshot(campaign.template_snapshot);
  const projectMap = await this.getScopeProjectMap(scopes.map((item: any) => item.project_id));
  const instanceSummary = campaign.campaign_type === "appointment_reward"
    ? await customerAppointmentRewardCampaignRepository.countByMarketingCampaignStatus(campaignId)
    : await customerProjectLogShareCampaignRepository.countByMarketingCampaignStatus(campaignId);

  return {
    id: campaign.id,
    campaign_type: campaign.campaign_type,
    name: campaign.name,
    status: campaign.status,
    enabled: campaign.enabled,
    template_id: campaign.template_id,
    template_summary: templateSummary
      ? {
        id: templateSummary.id,
        name: templateSummary.name,
        status: templateSummary.status,
      }
      : null,
    template_snapshot: templateSnapshot,
    target_scope_type: campaign.target_scope_type,
    valid_from: campaign.valid_from,
    valid_until: campaign.valid_until,
    auto_close_on_expire: campaign.auto_close_on_expire,
    reward_title: campaign.reward_title,
    reward_remark: campaign.reward_remark,
    reward_claim_instruction: campaign.reward_claim_instruction,
    reward_claim_channel: campaign.reward_claim_channel,
    config_payload: await this.buildNormalizedMarketingCampaignConfigPayload(
      campaign.campaign_type,
      campaign.config_payload,
    ),
    exclude_project_ids: scopes
      .filter((item) => item.scope_mode === "exclude")
      .map((item: any) => item.project_id),
    include_project_ids: scopes
      .filter((item) => item.scope_mode === "include")
      .map((item: any) => item.project_id),
    scopes: scopes.map((item: any) => ({
      scope_mode: item.scope_mode,
      project_id: item.project_id,
      project_name: projectMap.get(item.project_id)?.name || null,
    })),
    summary: instanceSummary,
  };
}

export async function createMarketingCampaign(this: any, 
  authContext: AuthContext,
  input: CreateMarketingCampaignInput,
) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const template = input.template_id
    ? await this.getMarketingCampaignTemplateOrThrow(input.template_id)
    : null;

  if (template) {
    if (template.campaign_type !== input.campaign_type) {
      throw Errors.business(
        400,
        "模板活动类型与当前活动类型不一致",
        ErrorCodes.MARKETING_TEMPLATE_CAMPAIGN_TYPE_MISMATCH,
      );
    }
    if (template.status !== "active" || !template.enabled) {
      throw Errors.business(
        409,
        "当前模板不可用于创建活动",
        ErrorCodes.MARKETING_TEMPLATE_DISABLED,
      );
    }
  }

  const resolvedInput = await this.resolveMarketingCampaignCreateInput(input, template);
  const scopeRows = this.buildMarketingCampaignScopeRows(resolvedInput);
  await this.assertMarketingScopeProjectsAccessible({
    authContext,
    projectIds: scopeRows.map((item: any) => item.project_id),
    permissionCode: "project.update",
  });

  const campaign = await marketingCampaignRepository.create({
    tenant_id: tenantId,
    campaign_type: resolvedInput.campaign_type,
    name: resolvedInput.name,
    enabled: resolvedInput.enabled,
    status: resolvedInput.status,
    target_scope_type: resolvedInput.target_scope_type,
    valid_from: resolvedInput.valid_from ?? null,
    valid_until: resolvedInput.valid_until ?? null,
    auto_close_on_expire: resolvedInput.auto_close_on_expire,
    reward_title: resolvedInput.reward_title ?? null,
    reward_remark: resolvedInput.reward_remark ?? null,
    reward_claim_instruction: resolvedInput.reward_claim_instruction ?? null,
    reward_claim_channel: resolvedInput.reward_claim_channel ?? null,
    template_id: template?.id ?? null,
    template_snapshot: template ? await this.buildMarketingCampaignTemplateSnapshot(template) : null,
    config_payload: this.buildMarketingCampaignTemplateConfigPayload(resolvedInput),
    created_by_employee_id: authContext.employeeId,
    updated_by_employee_id: authContext.employeeId,
  });

  await marketingCampaignRepository.replaceScopes(campaign.id, tenantId, scopeRows);
  return this.getMarketingCampaignDetail(authContext, campaign.id);
}

export async function updateMarketingCampaign(this: any, 
  authContext: AuthContext,
  campaignId: string,
  input: UpdateMarketingCampaignInput,
) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const existing = await this.getMarketingCampaignOrThrow(campaignId, tenantId);
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.update",
    );
  const existingScopes = await marketingCampaignRepository.listScopesByCampaignId(campaignId, tenantId);
  if (!this.campaignVisibleToEmployee(existing, existingScopes, visibleProjectIds)) {
    throw Errors.forbidden();
  }

  const scopeRows = this.buildMarketingCampaignScopeRows(input);
  await this.assertMarketingScopeProjectsAccessible({
    authContext,
    projectIds: scopeRows.map((item: any) => item.project_id),
    permissionCode: "project.update",
  });

  await marketingCampaignRepository.update({
    id: campaignId,
    tenant_id: tenantId,
    campaign_type: input.campaign_type,
    name: input.name,
    enabled: input.enabled,
    status: input.status,
    target_scope_type: input.target_scope_type,
    valid_from: input.valid_from ?? null,
    valid_until: input.valid_until ?? null,
    auto_close_on_expire: input.auto_close_on_expire,
    reward_title: input.reward_title ?? null,
    reward_remark: input.reward_remark ?? null,
    reward_claim_instruction: input.reward_claim_instruction ?? null,
    reward_claim_channel: input.reward_claim_channel ?? null,
    template_id: existing.template_id,
    template_snapshot: existing.template_snapshot,
    config_payload: this.buildMarketingCampaignTemplateConfigPayload(input),
    updated_by_employee_id: authContext.employeeId,
  });
  await marketingCampaignRepository.replaceScopes(campaignId, tenantId, scopeRows);
  return this.getMarketingCampaignDetail(authContext, campaignId);
}

export async function updateMarketingCampaignStatus(this: any, 
  authContext: AuthContext,
  campaignId: string,
  input: MarketingCampaignStatusUpdateInput,
) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
    authContext,
    "project.update",
  );
  const existing = await this.getMarketingCampaignOrThrow(campaignId, tenantId);
  const existingScopes = await marketingCampaignRepository.listScopesByCampaignId(campaignId, tenantId);
  if (!this.campaignVisibleToEmployee(existing, existingScopes, visibleProjectIds)) {
    throw Errors.forbidden();
  }

  await marketingCampaignRepository.updateStatus(
    campaignId,
    input.status,
    authContext.employeeId,
    tenantId,
  );
  return this.getMarketingCampaignDetail(authContext, campaignId);
}
