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


export type ActiveBusinessMembership = Awaited<
  ReturnType<typeof userIdentityService.listActiveBusinessMemberships>
>[number];

export const CUSTOMER_PROJECT_CAMPAIGN_SUMMARY_CACHE_TTL_MS = 60_000;
export const CUSTOMER_APPOINTMENT_REWARD_CAMPAIGN_CACHE_TTL_MS = 300_000;
export const CUSTOMER_PROJECT_LOG_SHARE_HOT_CACHE_TTL_MS = 60_000;
export const MAX_CUSTOMER_PROJECT_LOG_SHARE_HOT_CACHE_SIZE = 2_000;

export type CustomerProjectRow = {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  name: string | null;
  status: string | null;
  address: string | null;
  style_tags: unknown;
  property: {
    community: string | null;
    building_info: string | null;
  } | {
    community: string | null;
    building_info: string | null;
  }[] | null;
  designer?: {
    name: string | null;
  } | {
    name: string | null;
  }[] | null;
};

export type CustomerProjectLogRow = {
  id: string;
  tenant_id?: string | null;
  project_id: string;
  stage_code: string | null;
  node_name: string | null;
  content: string | null;
  images: unknown;
  created_at: string | null;
};

export type CustomerRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  user_id: string | null;
};

export type CustomerProjectScope = {
  customerId?: string | null;
  tenantId?: string | null;
};

export type CustomerProjectLogShareContext = {
  tenant_id: string | null;
  customer_id: string;
  customer_name: string | null;
  project_id: string;
  project_name: string | null;
  project_status: string | null;
  project_status_label: string | null;
  project_address: string | null;
  project_style_tags: string[];
  property_community: string | null;
  property_building_info: string | null;
  designer_name: string | null;
  log_id: string;
  stage_code: ProjectLogStageCode | null;
  stage_label: string | null;
  node_name: string | null;
  log_content: string | null;
  log_images: string[];
  created_at: string | null;
};

export type GeneratedShareCopy = {
  id: string;
  text: string;
};

export const DEFAULT_SHARE_REWARD_TITLE = "专属到店礼";
export const DEFAULT_SHARE_REWARD_REMARK = "凭分享图到店可领取";
export const DEFAULT_SHARE_CAMPAIGN_PAGE = "pages/share-campaign/index";
export const DEFAULT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE = "pages/share-campaign-claim-voucher/index";

export let cachedWechatAccessToken: {
  token: string;
  expiresAt: number;
} | null = null;

export type ShareCampaignSummary = {
  instance_id: string;
  campaign_id: string;
  id: string;
  marketing_campaign_id: string | null;
  project_id: string;
  log_id: string;
  share_token: string;
  status: CustomerProjectLogShareCampaignRow["status"];
  target_assist_count: number;
  assist_count: number;
  assist_uv: number;
  remaining_count: number;
  reward_claim_status: CustomerProjectLogShareCampaignRow["reward_claim_status"];
  reward_claim_code: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
};

export type MarketingCampaignTemplateSnapshot = {
  id: string;
  campaign_type: "share_assist" | "appointment_reward";
  name: string;
  description: string | null;
  status: MarketingCampaignTemplateStatus;
  enabled: boolean;
  default_target_scope_type: "all_projects" | "project_list";
  reward_title: string | null;
  reward_remark: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  config_payload: Record<string, unknown>;
};

export type AppointmentRewardSummary = {
  reward_title: string | null;
  reward_claim_instruction: string | null;
  display_title: string | null;
  display_subtitle: string | null;
};

export type CampaignOwnerRow = {
  id: string;
  name: string | null;
  user_id: string | null;
};

export type UserProfileRow = {
  auth_user_id: string;
  nickname: string | null;
  avatar_path: string | null;
};

export type ViewerAssistInfo = {
  is_authenticated: boolean;
  can_assist: boolean;
  assist_block_reason:
    | "not_authenticated"
    | "already_assisted"
    | "owner_self"
    | "campaign_achieved"
    | "reward_claimed"
    | "campaign_closed"
    | "risk_blocked"
    | null;
  has_assisted: boolean;
  is_owner: boolean;
};

export type RecentHelperSummary = {
  helper_name: string;
  helper_avatar: string | null;
  assisted_at: string | null;
};

export type RewardClaimVoucherStatus = "active" | "claimed" | "expired" | "invalid";

export type RewardClaimVoucherPayload = {
  voucher_token: string;
  status: RewardClaimVoucherStatus;
  expires_at: string | null;
};

export type EffectiveShareCampaignConfig = {
  config_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_type: string;
  enabled: boolean;
  config_status: ProjectShareCampaignConfigRow["config_status"];
  config_mode: ProjectShareCampaignConfigRow["config_mode"];
  template_id: string | null;
  template_name: string | null;
  target_assist_count: number;
  reward_title: string;
  reward_remark: string;
  reward_claim_instruction: string;
  reward_claim_channel: string;
  valid_from: string | null;
  valid_until: string | null;
  auto_close_on_expire: boolean;
  allow_create_when_existing_active: boolean;
  default_display_title: string | null;
  default_display_subtitle: string | null;
};
