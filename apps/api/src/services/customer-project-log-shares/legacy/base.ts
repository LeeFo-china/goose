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

let cachedWechatAccessToken: { token: string; expiresAt: number } | null = null;

export function customerProjectCampaignSummaryCacheKey(this: any, 
  authUserId: string,
  projectId: string,
  scope?: CustomerProjectScope,
) {
  return `${this.customerProjectScopeCacheKey(authUserId, scope)}:${projectId}`;
}

export function customerAppointmentRewardCampaignCacheKey(this: any, 
  authUserId: string,
  projectId: string,
  scope?: CustomerProjectScope,
) {
  return `${this.customerProjectScopeCacheKey(authUserId, scope)}:${projectId}`;
}

export function customerProjectScopeCacheKey(this: any, authUserId: string, scope?: CustomerProjectScope) {
  if (scope?.customerId) {
    return `customer:${scope.tenantId || "none"}:${scope.customerId}`;
  }

  return `auth:${authUserId}`;
}

export function getHotCacheValue<T>(this: any, cache: Map<string, { expiresAt: number; value: T }>, key: string) {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

export function getHotCacheEntry<T>(this: any, cache: Map<string, { expiresAt: number; value: T }>, key: string) {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return cached;
}

export function setHotCacheValue<T>(this: any, cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T) {
  const now = Date.now();
  if (cache.size >= MAX_CUSTOMER_PROJECT_LOG_SHARE_HOT_CACHE_SIZE) {
    for (const [cacheKey, cached] of cache.entries()) {
      if (cached.expiresAt <= now) {
        cache.delete(cacheKey);
      }
    }

    if (cache.size >= MAX_CUSTOMER_PROJECT_LOG_SHARE_HOT_CACHE_SIZE) {
      cache.clear();
    }
  }

  cache.set(key, {
    expiresAt: now + CUSTOMER_PROJECT_LOG_SHARE_HOT_CACHE_TTL_MS,
    value,
  });
}

export function getCachedCustomerProjectCampaignSummary(this: any, cacheKey: string) {
  const cached = this.customerProjectCampaignSummaryCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    this.customerProjectCampaignSummaryCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

export function setCachedCustomerProjectCampaignSummary(this: any, 
  cacheKey: string,
  value: Awaited<any>,
) {
  this.customerProjectCampaignSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + CUSTOMER_PROJECT_CAMPAIGN_SUMMARY_CACHE_TTL_MS,
    value,
  });
}

export function hasCachedCustomerAppointmentRewardCampaignMiss(this: any, cacheKey: string) {
  const cached = this.customerAppointmentRewardCampaignMissCache.get(cacheKey);
  if (!cached) {
    return false;
  }

  if (cached.expiresAt <= Date.now()) {
    this.customerAppointmentRewardCampaignMissCache.delete(cacheKey);
    return false;
  }

  return true;
}

export function setCachedCustomerAppointmentRewardCampaignMiss(this: any, cacheKey: string) {
  this.customerAppointmentRewardCampaignMissCache.set(cacheKey, {
    expiresAt: Date.now() + CUSTOMER_APPOINTMENT_REWARD_CAMPAIGN_CACHE_TTL_MS,
  });
}

export function buildCampaignSummary(this: any, 
  campaign: CustomerProjectLogShareCampaignRow,
): ShareCampaignSummary {
  return {
    campaign_id: campaign.id,
    id: campaign.id,
    share_token: campaign.share_token,
    status: campaign.status,
    target_assist_count: campaign.target_assist_count,
    assist_count: campaign.assist_count,
    assist_uv: campaign.assist_uv,
    remaining_count: Math.max(campaign.target_assist_count - campaign.assist_count, 0),
    reward_claim_status: campaign.reward_claim_status,
    reward_claim_code: campaign.reward_claim_code,
    reward_claim_instruction: campaign.reward_claim_instruction,
    reward_claim_channel: campaign.reward_claim_channel,
  };
}

export function getImagePublicUrl(this: any, path: string | null | undefined) {
  return resolveStoredFileUrl(path);
}

export async function listCustomerProfilesByMembership(this: any, authUserId: string) {
  const memberships = await userIdentityService.listActiveBusinessMemberships({
    userId: authUserId,
    identityType: "customer",
  });
  const customerIds = Array.from(new Set(memberships.map((item: any) => item.identity_id)));
  if (customerIds.length === 0) {
    return [] as CustomerRow[];
  }

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select("id, tenant_id, name, user_id")
    .in("id", customerIds);

  if (error) {
    throw Errors.dbError("查询客户身份失败", error);
  }

  const membershipTenantMap = new Map(
    memberships.map((item: any) => [item.identity_id, item.tenant_id]),
  );

  return ((data || []) as CustomerRow[]).filter((customer) => (
    customer.tenant_id &&
    customer.tenant_id === membershipTenantMap.get(customer.id)
  ));
}

export async function getCustomerByAuthUserId(this: any, authUserId: string) {
  const cached = this.getHotCacheValue(this.customerByAuthUserCache, authUserId);
  if (cached) {
    return cached;
  }

  const inFlight = this.customerByAuthUserInFlight.get(authUserId);
  if (inFlight) {
    return inFlight;
  }

  const request = this.loadCustomerByAuthUserId(authUserId)
    .then((result: any) => {
      this.setHotCacheValue(this.customerByAuthUserCache, authUserId, result);
      return result;
    })
    .finally(() => {
      if (this.customerByAuthUserInFlight.get(authUserId) === request) {
        this.customerByAuthUserInFlight.delete(authUserId);
      }
    });
  this.customerByAuthUserInFlight.set(authUserId, request);
  return request;
}

export async function loadCustomerByAuthUserId(this: any, authUserId: string) {
  const list = await this.listCustomerProfilesByMembership(authUserId);
  if (list.length > 1) {
    throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
  }

  if (!list[0]) {
    throw Errors.forbidden();
  }

  return list[0];
}

export async function getCustomerById(this: any, customerId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select("id, name, user_id")
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询客户信息失败", error);
  }

  if (!data) {
    throw Errors.badRequest("分享活动所属客户不存在");
  }

  return data as CampaignOwnerRow;
}

export async function getWechatAccessToken(this: any, ) {
  if (cachedWechatAccessToken && cachedWechatAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedWechatAccessToken.token;
  }

  const appId = await systemSettingsService.getSecretString("WECHAT_APPID");
  const secret = await systemSettingsService.getSecretString("WECHAT_SECRET");
  if (!appId || !secret) {
    throw Errors.badRequest("服务器未配置微信参数");
  }

  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`,
  );
  if (!response.ok) {
    throw Errors.dbError("获取微信 access_token 失败", { status: response.status });
  }

  const result = await response.json() as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (!result.access_token) {
    throw Errors.dbError("获取微信 access_token 失败", result);
  }

  cachedWechatAccessToken = {
    token: result.access_token,
    expiresAt: Date.now() + ((result.expires_in || 7200) * 1000),
  };

  return result.access_token;
}

export async function getUserProfileByAuthUserId(this: any, authUserId: string | null) {
  if (!authUserId) {
    return null;
  }

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("user_profiles")
    .select("auth_user_id, nickname, avatar_path")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询用户资料失败", error);
  }

  return (data || null) as UserProfileRow | null;
}
