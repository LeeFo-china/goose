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

import { serializeShareRewardCode } from "../share-reward-code";

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

export async function generateShareCopies(this: any, 
  authUserId: string,
  projectId: string,
  logId: string,
  input: GenerateCustomerProjectLogShareCopyInput,
) {
  const context = await this.getOwnedProjectLogContext(
    authUserId,
    projectId,
    logId,
  );
  const copies = await this.requestAiCopies(context, input);

  return {
    copies,
  };
}

export async function getShareCard(this: any, 
  authUserId: string,
  projectId: string,
  logId: string,
  query?: GetCustomerProjectLogShareCardQuery,
) {
  const { context, campaign } = await this.resolveOptionalShareCampaignForOwnedLog({
    authUserId,
    projectId,
    logId,
    shareToken: query?.share_token,
  });

  return {
    project_name: context.project_name,
    stage_code: context.stage_code,
    stage_label: context.stage_label,
    log_title: context.node_name || context.stage_label || "施工日志更新",
    log_content: context.log_content,
    images: context.log_images,
    style_tags: context.project_style_tags,
    designer_name: context.designer_name,
    share_reward_title: campaign ? getCampaignRewardTitle(campaign) : null,
    share_reward_code: campaign
      ? serializeShareRewardCode({
        status: campaign.status,
        achievedAt: campaign.achieved_at,
        assistCount: campaign.assist_count,
        targetAssistCount: campaign.target_assist_count,
        rewardClaimCode: campaign.reward_claim_code,
      })
      : null,
    share_reward_remark: campaign ? getCampaignRewardRemark(campaign) : null,
    share_token: campaign?.share_token || null,
    campaign: campaign ? this.buildCampaignSummary(campaign) : null,
  };
}

export async function getShareCampaignQrcodeBuffer(this: any, shareToken: string) {
  await this.getCampaignByToken(shareToken);
  const accessToken = await this.getWechatAccessToken();
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scene: buildMiniProgramScene(shareToken),
        page: await getWechatShareCampaignPage(),
        check_path: false,
        env_version: "release",
      }),
    },
  );

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    throw Errors.dbError("生成分享二维码失败", { status: response.status });
  }

  if (contentType.includes("application/json")) {
    const result = await response.json();
    throw Errors.dbError("生成分享二维码失败", result);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw Errors.dbError("生成分享二维码失败");
  }

  return buffer;
}

export async function getRewardClaimVoucherQrcodeBuffer(this: any, voucherToken: string) {
  const campaign = await customerProjectLogShareCampaignRepository.findByVoucherToken(
    normalizeVoucherToken(voucherToken),
  );
  if (!campaign) {
    throw Errors.badRequest("领取凭证不存在");
  }

  const finalCampaign = await this.ensureCampaignPhase2Metadata(campaign);
  if (!finalCampaign.reward_claim_voucher_token) {
    throw Errors.badRequest("领取凭证不存在");
  }

  const accessToken = await this.getWechatAccessToken();
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scene: buildVoucherMiniProgramScene(finalCampaign.reward_claim_voucher_token),
        page: await getWechatShareCampaignClaimVoucherPage(),
        check_path: false,
        env_version: "release",
      }),
    },
  );

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    throw Errors.dbError("生成领取凭证二维码失败", { status: response.status });
  }

  if (contentType.includes("application/json")) {
    const result = await response.json();
    throw Errors.dbError("生成领取凭证二维码失败", result);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw Errors.dbError("生成领取凭证二维码失败");
  }

  return buffer;
}

export async function getAppointmentRewardClaimVoucherQrcodeBuffer(this: any, voucherToken: string) {
  const campaign = await customerAppointmentRewardCampaignRepository.findByVoucherToken(
    normalizeVoucherToken(voucherToken),
  );
  if (!campaign) {
    throw Errors.badRequest("领取凭证不存在");
  }

  const finalCampaign = await this.ensureAppointmentRewardMetadata(campaign);
  if (!finalCampaign.reward_claim_voucher_token) {
    throw Errors.badRequest("领取凭证不存在");
  }

  const accessToken = await this.getWechatAccessToken();
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scene: buildVoucherMiniProgramScene(finalCampaign.reward_claim_voucher_token),
        page: await getWechatShareCampaignClaimVoucherPage(),
        check_path: false,
        env_version: "release",
      }),
    },
  );

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    throw Errors.dbError("生成领取凭证二维码失败", { status: response.status });
  }

  if (contentType.includes("application/json")) {
    const result = await response.json();
    throw Errors.dbError("生成领取凭证二维码失败", result);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw Errors.dbError("生成领取凭证二维码失败");
  }

  return buffer;
}
