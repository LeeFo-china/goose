import { randomUUID } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import { aiGateway } from "@/services/ai-gateway";
import type { AuthContext } from "@/services/authorization";
import { systemSettingsService } from "@/services/system-settings";
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

type CustomerProjectRow = {
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
  designer: {
    name: string | null;
  } | {
    name: string | null;
  }[] | null;
};

type CustomerProjectLogRow = {
  id: string;
  tenant_id?: string | null;
  project_id: string;
  stage_code: string | null;
  node_name: string | null;
  content: string | null;
  images: unknown;
  created_at: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  user_id: string | null;
};

type CustomerProjectLogShareContext = {
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

type GeneratedShareCopy = {
  id: string;
  text: string;
};

const PROJECT_LOGS_BUCKET = "project-logs";
const DEFAULT_SHARE_REWARD_TITLE = "专属到店礼";
const DEFAULT_SHARE_REWARD_REMARK = "凭分享图到店可领取";
const DEFAULT_SHARE_CAMPAIGN_PAGE = "pages/share-campaign/index";
const DEFAULT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE = "pages/share-campaign-claim-voucher/index";

let cachedWechatAccessToken: {
  token: string;
  expiresAt: number;
} | null = null;

type ShareCampaignSummary = {
  id: string;
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

type MarketingCampaignTemplateSnapshot = {
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

type AppointmentRewardSummary = {
  reward_title: string | null;
  reward_claim_instruction: string | null;
  display_title: string | null;
  display_subtitle: string | null;
};

type CampaignOwnerRow = {
  id: string;
  name: string | null;
  user_id: string | null;
};

type UserProfileRow = {
  auth_user_id: string;
  nickname: string | null;
  avatar_path: string | null;
};

type ViewerAssistInfo = {
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

type RecentHelperSummary = {
  helper_name: string;
  helper_avatar: string | null;
  assisted_at: string | null;
};

type RewardClaimVoucherStatus = "active" | "claimed" | "expired" | "invalid";

type RewardClaimVoucherPayload = {
  voucher_token: string;
  status: RewardClaimVoucherStatus;
  expires_at: string | null;
};

type EffectiveShareCampaignConfig = {
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

function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

async function getAiEndpoint() {
  const hasDeepSeekApiKey = Boolean(await systemSettingsService.getSecretString("DEEPSEEK_API_KEY"));
  return (await systemSettingsService.getString("AI_CHAT_COMPLETIONS_URL"))
    || (hasDeepSeekApiKey
      ? "https://api.deepseek.com/chat/completions"
      : "https://api.openai.com/v1/chat/completions");
}

async function getAiApiKey(endpoint: string) {
  const envNames = endpoint.includes("api.deepseek.com")
    ? ["DEEPSEEK_API_KEY", "AI_API_KEY"]
    : ["AI_API_KEY", "DEEPSEEK_API_KEY"];

  for (const name of envNames) {
    const value = await systemSettingsService.getSecretString(name);
    if (value) return value;
  }

  return firstNonEmptyEnv(envNames);
}

async function getAiModel(endpoint: string) {
  const explicit = await systemSettingsService.getString("AI_MODEL");
  if (explicit) {
    return explicit;
  }

  return endpoint.includes("api.deepseek.com") ? "deepseek-chat" : "";
}

async function getWechatShareCampaignPage() {
  return systemSettingsService.getString(
    "WECHAT_SHARE_CAMPAIGN_PAGE",
    DEFAULT_SHARE_CAMPAIGN_PAGE,
  );
}

async function getWechatShareCampaignClaimVoucherPage() {
  return systemSettingsService.getString(
    "WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE",
    DEFAULT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE,
  );
}

async function getCustomerProjectLogShareTargetAssistCount() {
  const parsed = await systemSettingsService.getNumber(
    "CUSTOMER_LOG_SHARE_TARGET_ASSIST_COUNT",
    10,
  );
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return 10;
}

function normalizeRelation<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") {
      return { ...fallback, ...(first as T) };
    }

    return fallback;
  }

  if (value && typeof value === "object") {
    return { ...fallback, ...(value as T) };
  }

  return fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProjectLogImages(images: unknown) {
  if (!Array.isArray(images)) {
    return [] as string[];
  }

  return images
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (/^https?:\/\//i.test(item)) {
        return item;
      }

      return SupabaseDB.getAdminClient()
        .storage
        .from(PROJECT_LOGS_BUCKET)
        .getPublicUrl(item)
        .data.publicUrl;
    });
}

function buildShareRewardCode(input: {
  customerId: string;
  projectId: string;
  logId: string;
}) {
  const today = new Date();
  const dateCode = [
    String(today.getFullYear()),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = `${input.customerId}${input.projectId}${input.logId}`
    .replace(/-/g, "")
    .slice(-6)
    .toUpperCase();

  return `MJ-${dateCode}-${suffix}`;
}

function buildCampaignRewardTitle(targetAssistCount: number) {
  return `${targetAssistCount}人助力解锁${DEFAULT_SHARE_REWARD_TITLE}`;
}

function buildDefaultConfigRewardTitle(targetAssistCount: number) {
  return buildCampaignRewardTitle(targetAssistCount);
}

function getCampaignRewardTitle(campaign: Pick<CustomerProjectLogShareCampaignRow, "reward_title" | "target_assist_count">) {
  return campaign.reward_title?.trim() || buildCampaignRewardTitle(campaign.target_assist_count);
}

function getCampaignRewardRemark(campaign: Pick<CustomerProjectLogShareCampaignRow, "reward_remark">) {
  return campaign.reward_remark?.trim() || DEFAULT_SHARE_REWARD_REMARK;
}

function buildRewardClaimCode(campaign: Pick<CustomerProjectLogShareCampaignRow, "id" | "created_at">) {
  const baseDate = new Date(campaign.created_at);
  const dateCode = [
    String(baseDate.getFullYear()),
    String(baseDate.getMonth() + 1).padStart(2, "0"),
    String(baseDate.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = campaign.id.replace(/-/g, "").slice(0, 4).toUpperCase();

  return `MJ-CLAIM-${dateCode}-${suffix}`;
}

function buildRewardClaimVoucherToken() {
  return `rcv_${randomUUID().replace(/-/g, "")}`;
}

function getDefaultRewardClaimInstruction(targetAssistCount: number) {
  return `邀请满${targetAssistCount}位好友助力后，到店出示领奖码领取礼品`;
}

function getAppointmentRewardTitle(value: string | null | undefined) {
  return value?.trim() || "预约到店即可领取礼品";
}

function getAppointmentRewardClaimInstruction(value: string | null | undefined) {
  return value?.trim() || "提交预约信息并到店后可领取礼品";
}

function normalizePhoneLike(value: string) {
  return value.trim();
}

function maskDisplayName(value: string | null | undefined) {
  const text = value?.trim() || "";
  if (!text) {
    return "好友";
  }

  if (text.length === 1) {
    return `${text}*`;
  }

  return `${text.slice(0, 1)}*`;
}

function buildShareToken() {
  return `st_${randomUUID().replace(/-/g, "")}`;
}

function normalizeShareToken(input: string) {
  const value = input.trim();
  if (!value) {
    return value;
  }

  if (value.startsWith("st_")) {
    return value;
  }

  return `st_${value}`;
}

function buildMiniProgramScene(shareToken: string) {
  return normalizeShareToken(shareToken).replace(/^st_/, "").slice(0, 32);
}

function normalizeVoucherToken(input: string) {
  const value = input.trim();
  if (!value) {
    return value;
  }

  if (value.startsWith("rcv_")) {
    return value;
  }

  return `rcv_${value}`;
}

function buildVoucherMiniProgramScene(voucherToken: string) {
  return normalizeVoucherToken(voucherToken).replace(/^rcv_/, "").slice(0, 32);
}

function buildCopyPrompt(
  context: CustomerProjectLogShareContext,
  input: GenerateCustomerProjectLogShareCopyInput,
) {
  return `你是装修进度分享文案助手。请基于下面这条真实施工日志，生成 3 条适合客户发朋友圈的中文短文案。

要求：
1. 文风选择：${input.style}
2. 长度选择：${input.length}
3. 每条 1-2 句话，真实、温暖、克制，不要销售腔。
4. 不要夸大宣传，不要编造未提供的信息。
5. 不要出现“欢迎咨询”“扫码联系”等广告导流话术。
6. 严格返回 JSON：
{
  "copies": [
    { "id": "copy_1", "text": "..." },
    { "id": "copy_2", "text": "..." },
    { "id": "copy_3", "text": "..." }
  ]
}

上下文：
- 项目名称：${context.project_name || "未同步"}
- 项目状态：${context.project_status_label || context.project_status || "未同步"}
- 风格标签：${context.project_style_tags.join("、") || "未同步"}
- 房产：${[context.property_community, context.property_building_info].filter(Boolean).join("，") || "未同步"}
- 设计师：${context.designer_name || "未同步"}
- 日志阶段：${context.stage_label || context.stage_code || "未同步"}
- 节点名称：${context.node_name || "未同步"}
- 日志正文：${context.log_content || "未同步"}
- 图片数量：${context.log_images.length}`;
}

function fallbackCopies(
  context: CustomerProjectLogShareContext,
): GeneratedShareCopy[] {
  const stageText = context.stage_label || context.node_name || "装修进度";
  const projectText = context.project_name || "我家";
  const styleText = context.project_style_tags.length > 0
    ? `，整体风格也越来越接近想要的 ${context.project_style_tags[0]} 感觉`
    : "";

  return [
    {
      id: "copy_1",
      text: `今天看到 ${projectText} 的${stageText}推进得很顺，现场比想象中更整洁${styleText}，心里踏实了很多。`,
    },
    {
      id: "copy_2",
      text: `装修最怕不确定，但这次看到 ${projectText} 的${stageText}细节落得挺稳，家真的在一点点变成想象中的样子。`,
    },
    {
      id: "copy_3",
      text: `记录一下 ${projectText} 最近的装修进度：${stageText}${context.log_content ? `，${context.log_content.slice(0, 24)}` : ""}。慢慢看见家的轮廓，还是很开心。`,
    },
  ];
}

function parseCopiesResult(rawContent: string, context: CustomerProjectLogShareContext) {
  try {
    const start = rawContent.indexOf("{");
    const end = rawContent.lastIndexOf("}");
    const jsonText = start >= 0 && end >= start
      ? rawContent.slice(start, end + 1)
      : rawContent;
    const parsed = JSON.parse(jsonText) as {
      copies?: Array<{ id?: unknown; text?: unknown }>;
    };
    const copies = (parsed.copies || [])
      .filter((item) => typeof item?.text === "string")
      .map((item, index) => ({
        id: typeof item.id === "string" && item.id.trim()
          ? item.id.trim()
          : `copy_${index + 1}`,
        text: (item.text as string).trim(),
      }))
      .filter((item) => item.text)
      .slice(0, 3);

    return copies.length > 0 ? copies : fallbackCopies(context);
  } catch {
    return fallbackCopies(context);
  }
}

class CustomerProjectLogShareService {
  private buildCampaignSummary(
    campaign: CustomerProjectLogShareCampaignRow,
  ): ShareCampaignSummary {
    return {
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

  private getImagePublicUrl(path: string | null | undefined) {
    if (!path) {
      return null;
    }

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return SupabaseDB.getAdminClient()
      .storage
      .from(PROJECT_LOGS_BUCKET)
      .getPublicUrl(path)
      .data.publicUrl;
  }

  private async getCustomerByAuthUserId(authUserId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select("id, name, user_id")
      .eq("user_id", authUserId)
      .limit(2);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    const list = (data || []) as CustomerRow[];
    if (list.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
    }

    if (!list[0]) {
      throw Errors.forbidden();
    }

    return list[0];
  }

  private async getCustomerById(customerId: string) {
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

  private async getWechatAccessToken() {
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

  private async getUserProfileByAuthUserId(authUserId: string | null) {
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

  private async ensureCampaignRewardMetadata(
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

  private getVoucherExpiresAt(campaign: CustomerProjectLogShareCampaignRow) {
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

  private getRewardClaimVoucherStatus(
    campaign: CustomerProjectLogShareCampaignRow,
  ): RewardClaimVoucherStatus | null {
    if (!campaign.reward_claim_voucher_token) {
      return null;
    }

    if (campaign.status === "reward_claimed" || campaign.reward_claim_status === "claimed") {
      return "claimed";
    }

    if (campaign.status === "closed") {
      return "invalid";
    }

    const expiresAt = this.getVoucherExpiresAt(campaign);
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return "expired";
    }

    if (this.isCampaignRewardClaimable(campaign)) {
      return "active";
    }

    return "invalid";
  }

  private isCampaignRewardClaimable(campaign: CustomerProjectLogShareCampaignRow) {
    if (campaign.reward_claim_status === "claimed" || campaign.status === "reward_claimed") {
      return false;
    }

    return Boolean(
      campaign.status === "achieved"
      || campaign.achieved_at
      || campaign.assist_count >= campaign.target_assist_count,
    );
  }

  private buildRewardClaimVoucherPayload(
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

  private async ensureCampaignRewardClaimVoucher(
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

  private serializeRecentHelpers(
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

  private async getRecentHelpers(campaignId: string, limit: number) {
    const result = await customerProjectLogShareCampaignRepository.listValidAssists({
      campaign_id: campaignId,
      limit,
    });

    return this.serializeRecentHelpers(result.list);
  }

  private async ensureCampaignPhase2Metadata(
    campaign: CustomerProjectLogShareCampaignRow,
  ) {
    const withRewardMetadata = await this.ensureCampaignRewardMetadata(campaign);
    return this.ensureCampaignRewardClaimVoucher(withRewardMetadata);
  }

  private buildEffectiveConfig(
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

  private async parseShareAssistConfigPayload(
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

  private parseAppointmentRewardConfigPayload(
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

  private async buildNormalizedMarketingCampaignConfigPayload(
    campaignType: MarketingCampaignRow["campaign_type"] | MarketingCampaignTemplateRow["campaign_type"],
    payload: Record<string, unknown> | null,
  ) {
    return campaignType === "appointment_reward"
      ? this.parseAppointmentRewardConfigPayload(payload)
      : await this.parseShareAssistConfigPayload(payload);
  }

  private normalizeMarketingCampaignTemplateEnabled(status: MarketingCampaignTemplateStatus, enabled: boolean) {
    return status === "disabled" ? false : enabled;
  }

  private async buildMarketingCampaignTemplateSnapshot(
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

  private async parseMarketingCampaignTemplateSnapshot(
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

  private buildMarketingCampaignTemplateConfigPayload(
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

  private async buildEffectiveConfigFromMarketingCampaign(
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

  private getConfigBlockReason(
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

  private getMarketingCampaignBlockReason(
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

  private throwConfigBlocked(
    reason:
      | NonNullable<ReturnType<CustomerProjectLogShareService["getConfigBlockReason"]>>
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

  private async getProjectConfig(projectId: string) {
    return projectShareCampaignConfigRepository.findByProjectId(projectId);
  }

  private isProjectInMarketingCampaignScope(
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

  private async getMatchingMarketingCampaign(
    projectId: string,
    campaignType: "share_assist" | "appointment_reward" = "share_assist",
  ) {
    const campaigns = await marketingCampaignRepository.listActiveByType(campaignType);
    if (!campaigns.length) {
      return null;
    }

    const scopes = await marketingCampaignRepository.listScopesByCampaignIds(
      campaigns.map((item) => item.id),
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

  private buildAppointmentRewardSummary(campaign: MarketingCampaignRow): AppointmentRewardSummary {
    const payload = this.parseAppointmentRewardConfigPayload(campaign.config_payload);
    return {
      reward_title: getAppointmentRewardTitle(campaign.reward_title),
      reward_claim_instruction: getAppointmentRewardClaimInstruction(campaign.reward_claim_instruction),
      display_title: payload.default_display_title || "预约到店可领取专属礼品",
      display_subtitle: payload.default_display_subtitle || "提交预约信息并到店即可参与活动",
    };
  }

  private async getEffectiveProjectConfig(projectId: string) {
    const config = await this.getProjectConfig(projectId);
    const blockReason = this.getConfigBlockReason(config);
    return {
      raw: config,
      blockReason,
      effective: config && !blockReason ? this.buildEffectiveConfig(config) : null,
    };
  }

  private async getEffectiveShareCampaignConfig(projectId: string) {
    const matchedCampaign = await this.getMatchingMarketingCampaign(projectId, "share_assist");
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

    const legacyConfig = await this.getEffectiveProjectConfig(projectId);
    return {
      source: "legacy_project_config" as const,
      rawCampaign: null,
      rawLegacyConfig: legacyConfig.raw,
      blockReason: legacyConfig.blockReason,
      effective: legacyConfig.effective,
    };
  }

  private async buildViewerAssistInfo(
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

  private buildAssistBlockedError(input: {
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

  private async getOwnedProjectLogContext(
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
        ),
        designer:employees!projects_designer_id_fkey(
          name
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

    const { data: logData, error: logError } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, tenant_id, project_id, stage_code, node_name, content, images, created_at")
      .eq("id", logId)
      .eq("project_id", projectId)
      .eq("tenant_id", (projectData as unknown as CustomerProjectRow).tenant_id)
      .maybeSingle();

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
    const designer = normalizeRelation(project.designer, {
      name: null,
    });
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
      designer_name: typeof designer.name === "string" ? designer.name : null,
      log_id: log.id,
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: log.node_name,
      log_content: log.content,
      log_images: normalizeProjectLogImages(log.images),
      created_at: log.created_at,
    };
  }

  private async getOwnedProject(authUserId: string, projectId: string) {
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

  private async getOwnedProjectById(projectId: string) {
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

  private async getOwnedCampaignById(authUserId: string, campaignId: string) {
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

  private async getProjectLogById(logId: string) {
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

  private async getRecentImageProjectLog(projectId: string) {
    const { data: projectData, error: projectError } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("tenant_id")
      .eq("id", projectId)
      .maybeSingle<{ tenant_id: string | null }>();

    if (projectError) {
      throw Errors.dbError("查询项目租户失败", projectError);
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, tenant_id, project_id, stage_code, node_name, content, images, created_at")
      .eq("project_id", projectId)
      .eq("tenant_id", projectData?.tenant_id ?? null)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw Errors.dbError("查询项目施工日志失败", error);
    }

    const logs = (data || []) as CustomerProjectLogRow[];
    return logs.find((item) => normalizeProjectLogImages(item.images).length > 0) || null;
  }

  private async requestAiCopies(
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
      return parseCopiesResult(result.content, context);
    } catch {
      return fallbackCopies(context);
    }
  }

  private async ensureShareCampaign(
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

  private async getCampaignByToken(shareToken: string) {
    const campaign = await customerProjectLogShareCampaignRepository.findByShareToken(
      normalizeShareToken(shareToken),
    );
    if (!campaign) {
      throw Errors.badRequest("分享活动不存在");
    }

    return campaign;
  }

  private async resolveShareCampaignForOwnedLog(input: {
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

  private async resolveOptionalShareCampaignForOwnedLog(input: {
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

  private async buildCampaignPublicDetail(shareToken: string) {
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

  async generateShareCopies(
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

  async getShareCard(
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
        ? (campaign.reward_claim_code || buildShareRewardCode({
          customerId: context.customer_id,
          projectId: context.project_id,
          logId: context.log_id,
        }))
        : null,
      share_reward_remark: campaign ? getCampaignRewardRemark(campaign) : null,
      share_token: campaign?.share_token || null,
      campaign: campaign ? this.buildCampaignSummary(campaign) : null,
    };
  }

  async getShareCampaignQrcodeBuffer(shareToken: string) {
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

  async getRewardClaimVoucherQrcodeBuffer(voucherToken: string) {
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

  async getAppointmentRewardClaimVoucherQrcodeBuffer(voucherToken: string) {
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

  async getOrCreateShareCampaign(
    authUserId: string,
    projectId: string,
    logId: string,
    input: CreateCustomerProjectLogShareCampaignInput,
  ) {
    const { campaign } = await this.resolveShareCampaignForOwnedLog({
      authUserId,
      projectId,
      logId,
      channel: input.channel,
    });

    return this.buildCampaignSummary(await this.ensureCampaignPhase2Metadata(campaign));
  }

  async getShareCampaignDetail(
    shareToken: string,
    viewer?: { authUserId?: string | null; openid?: string | null },
  ) {
    const detail = await this.buildCampaignPublicDetail(shareToken);
    const owner = await this.getCustomerById(detail.campaign.customer_id);
    const campaign = await this.ensureCampaignPhase2Metadata(detail.campaign);
    const viewerInfo = await this.buildViewerAssistInfo(campaign, owner, viewer);
    const recentHelpers = await this.getRecentHelpers(campaign.id, 3);

    return {
      campaign_id: campaign.id,
      share_token: campaign.share_token,
      status: campaign.status,
      reward_claim_status: campaign.reward_claim_status,
      project_name: detail.project_name,
      stage_code: detail.stage_code,
      stage_label: detail.stage_label,
      log_title: detail.node_name || detail.stage_label || "施工日志更新",
      log_content: detail.log_content,
      images: detail.log_images,
      customer_nickname: detail.customer_nickname,
      assist_count: campaign.assist_count,
      target_assist_count: campaign.target_assist_count,
      remaining_count: Math.max(campaign.target_assist_count - campaign.assist_count, 0),
      reward_title: getCampaignRewardTitle(campaign),
      reward_remark: getCampaignRewardRemark(campaign),
      reward_claim_instruction: campaign.reward_claim_instruction,
      viewer: viewerInfo,
      recent_helpers: recentHelpers,
    };
  }

  async openShareCampaign(
    input: OpenCustomerProjectLogShareCampaignInput,
    visitor: {
      authUserId?: string;
      openid?: string | null;
      ip?: string | null;
    },
  ) {
    const campaign = await this.getCampaignByToken(input.share_token);
    const now = new Date().toISOString();
    await customerProjectLogShareCampaignRepository.createOpen({
      campaign_id: campaign.id,
      share_token: campaign.share_token,
      visitor_auth_user_id: visitor.authUserId ?? null,
      visitor_openid: visitor.openid ?? null,
      visitor_device_id: null,
      visitor_ip: visitor.ip ?? null,
      source: input.source,
    });
    const updated = await customerProjectLogShareCampaignRepository.touchLatestOpenedAt(
      campaign.id,
      now,
    );

    return {
      campaign_id: updated.id,
      share_token: updated.share_token,
      assist_count: updated.assist_count,
      target_assist_count: updated.target_assist_count,
      remaining_count: Math.max(updated.target_assist_count - updated.assist_count, 0),
      status: updated.status,
    };
  }

  async assistShareCampaign(
    input: AssistCustomerProjectLogShareCampaignInput,
    helper: {
      authUserId: string;
      openid?: string | null;
      ip?: string | null;
    },
  ) {
    const campaign = await this.ensureCampaignPhase2Metadata(
      await this.getCampaignByToken(input.share_token),
    );

    if (campaign.status !== "active") {
      if (campaign.status === "achieved") {
        throw this.buildAssistBlockedError({
          statusCode: 409,
          code: ErrorCodes.CAMPAIGN_ACHIEVED,
          message: "当前活动已达标",
          campaign,
          reason: "campaign_achieved",
        });
      }

      if (campaign.status === "reward_claimed") {
        throw this.buildAssistBlockedError({
          statusCode: 409,
          code: ErrorCodes.REWARD_CLAIMED,
          message: "当前活动奖励已领取",
          campaign,
          reason: "reward_claimed",
        });
      }

      throw this.buildAssistBlockedError({
        statusCode: 409,
        code: ErrorCodes.CAMPAIGN_CLOSED,
        message: "当前活动已关闭",
        campaign,
        reason: "campaign_closed",
      });
    }

    const owner = await this.getCustomerById(campaign.customer_id);
    if (owner.user_id && owner.user_id === helper.authUserId) {
      throw this.buildAssistBlockedError({
        statusCode: 403,
        code: ErrorCodes.OWNER_SELF_NOT_ALLOWED,
        message: "不能给自己助力",
        campaign,
        reason: "owner_self",
      });
    }

    const existingAssist = await customerProjectLogShareCampaignRepository.findAssist({
      campaign_id: campaign.id,
      helper_auth_user_id: helper.authUserId,
      helper_openid: helper.openid ?? null,
    });
    if (existingAssist) {
      throw this.buildAssistBlockedError({
        statusCode: 409,
        code: ErrorCodes.ALREADY_ASSISTED,
        message: "你已经助力过了",
        campaign,
        reason: "already_assisted",
      });
    }

    const helperProfile = await this.getUserProfileByAuthUserId(helper.authUserId);
    const helperName = helperProfile?.nickname || "好友";
    const helperAvatar = this.getImagePublicUrl(helperProfile?.avatar_path) || null;
    const now = new Date().toISOString();

    await customerProjectLogShareCampaignRepository.createAssist({
      campaign_id: campaign.id,
      share_token: campaign.share_token,
      helper_auth_user_id: helper.authUserId,
      helper_openid: helper.openid ?? null,
      helper_device_id: null,
      helper_ip: helper.ip ?? null,
      source: input.source,
      helper_name: helperName,
      helper_avatar: helperAvatar,
    });

    const assistCount = await customerProjectLogShareCampaignRepository.countAssists(campaign.id);
    const nextStatus = assistCount >= campaign.target_assist_count ? "achieved" : "active";
    const updatedCampaign = await customerProjectLogShareCampaignRepository.updateMetrics({
      id: campaign.id,
      assist_count: assistCount,
      assist_uv: assistCount,
      status: nextStatus,
      latest_assisted_at: now,
      achieved_at: nextStatus === "achieved"
        ? (campaign.achieved_at || new Date().toISOString())
        : null,
      reward_claim_status: nextStatus === "achieved"
        ? (campaign.reward_claim_status === "claimed" ? "claimed" : "unclaimed")
        : campaign.reward_claim_status,
      reward_claim_code: nextStatus === "achieved"
        ? (campaign.reward_claim_code || buildRewardClaimCode(campaign))
        : campaign.reward_claim_code,
      reward_claim_instruction: campaign.reward_claim_instruction
        || getDefaultRewardClaimInstruction(campaign.target_assist_count),
      reward_claim_channel: campaign.reward_claim_channel || "store",
    });

    return {
      success: true,
      campaign_id: updatedCampaign.id,
      share_token: updatedCampaign.share_token,
      status: updatedCampaign.status,
      reward_claim_status: updatedCampaign.reward_claim_status,
      assist_count: updatedCampaign.assist_count,
      target_assist_count: updatedCampaign.target_assist_count,
      remaining_count: Math.max(
        updatedCampaign.target_assist_count - updatedCampaign.assist_count,
        0,
      ),
    };
  }

  async createShareRecord(
    authUserId: string,
    projectId: string,
    logId: string,
    input: CreateCustomerProjectLogShareRecordInput,
  ) {
    const { context, campaign } = await this.resolveOptionalShareCampaignForOwnedLog({
      authUserId,
      projectId,
      logId,
    });
    const record = await customerProjectLogShareRepository.create({
      customer_id: context.customer_id,
      project_id: context.project_id,
      log_id: context.log_id,
      selected_copy_id: input.copy_id ?? null,
      selected_copy_text: input.copy_text ?? null,
      action: input.action,
    });

    if (input.action === "save_image" && campaign) {
      await customerProjectLogShareCampaignRepository.touchPosterSavedAt(campaign.id);
    }

    return {
      ...record,
      campaign: campaign ? this.buildCampaignSummary(campaign) : null,
    };
  }

  async getCustomerProjectCampaignSummary(authUserId: string, projectId: string) {
    const { customer } = await this.getOwnedProject(authUserId, projectId);
    const configResult = await this.getEffectiveShareCampaignConfig(projectId);
    const campaigns = (await customerProjectLogShareCampaignRepository.listByProject({
      customer_id: customer.id,
      project_id: projectId,
      limit: 20,
    })).map((item) => this.ensureCampaignPhase2Metadata(item));
    const resolvedCampaigns = await Promise.all(campaigns);

    const claimRewardCampaign = resolvedCampaigns.find((item) =>
      this.isCampaignRewardClaimable(item)
    ) || null;
    const activeCampaign = resolvedCampaigns.find((item) => item.status === "active") || null;
    const claimedCampaign = resolvedCampaigns.find((item) => item.status === "reward_claimed") || null;

    const focusCampaign = claimRewardCampaign || activeCampaign || claimedCampaign;
    const recentLog = focusCampaign
      ? await this.getProjectLogById(focusCampaign.log_id)
      : await this.getRecentImageProjectLog(projectId);

    if (!focusCampaign && !recentLog) {
      return {
        project_id: projectId,
        display_mode: configResult.effective ? "empty" as const : "disabled" as const,
        config_enabled: configResult.rawCampaign
          ? Boolean(configResult.rawCampaign.enabled)
          : Boolean(configResult.rawLegacyConfig?.enabled),
        config_status: configResult.rawCampaign?.status || configResult.rawLegacyConfig?.config_status || null,
        recommended_log: null,
        focus_campaign: null,
      };
    }

    const recommendedLog = recentLog
      ? {
        log_id: recentLog.id,
        log_title: recentLog.node_name
          || (isProjectLogStageCode(recentLog.stage_code)
            ? PROJECT_LOG_STAGE_CONFIG[recentLog.stage_code].label
            : "施工日志更新"),
        stage_label: isProjectLogStageCode(recentLog.stage_code)
          ? PROJECT_LOG_STAGE_CONFIG[recentLog.stage_code].label
          : null,
        created_at: recentLog.created_at,
        cover_image: normalizeProjectLogImages(recentLog.images)[0] || null,
      }
      : null;

    const displayMode = focusCampaign
      ? focusCampaign.status === "achieved" && focusCampaign.reward_claim_status !== "claimed"
        ? "claim_reward"
        : focusCampaign.status === "reward_claimed"
          ? "reward_claimed"
          : "continue_campaign"
      : configResult.effective
        ? "create_campaign"
        : "disabled";

    return {
      project_id: projectId,
      display_mode: displayMode,
      config_enabled: configResult.rawCampaign
        ? Boolean(configResult.rawCampaign.enabled)
        : Boolean(configResult.rawLegacyConfig?.enabled),
      config_status: configResult.rawCampaign?.status || configResult.rawLegacyConfig?.config_status || null,
      recommended_log: recommendedLog,
      focus_campaign: focusCampaign
        ? {
          ...this.buildCampaignSummary(focusCampaign),
          reward_title: getCampaignRewardTitle(focusCampaign),
        }
        : null,
    };
  }

  async getCustomerCampaignDetail(authUserId: string, campaignId: string) {
    const { campaign } = await this.getOwnedCampaignById(authUserId, campaignId);
    const detail = await this.buildCampaignPublicDetail(campaign.share_token);
    const recentHelpers = await this.getRecentHelpers(campaign.id, 3);
    const rewardClaimVoucher = this.buildRewardClaimVoucherPayload(campaign);

    return {
      campaign_id: campaign.id,
      share_token: campaign.share_token,
      project_id: campaign.project_id,
      log_id: campaign.log_id,
      status: campaign.status,
      reward_claim_status: campaign.reward_claim_status,
      project_name: detail.project_name,
      stage_code: detail.stage_code,
      stage_label: detail.stage_label,
      log_title: detail.node_name || detail.stage_label || "施工日志更新",
      images: detail.log_images,
      assist_count: campaign.assist_count,
      target_assist_count: campaign.target_assist_count,
      remaining_count: Math.max(campaign.target_assist_count - campaign.assist_count, 0),
      reward_title: getCampaignRewardTitle(campaign),
      reward_remark: getCampaignRewardRemark(campaign),
      reward_claim_code: campaign.reward_claim_code,
      reward_claim_instruction: campaign.reward_claim_instruction,
      reward_claim_channel: campaign.reward_claim_channel,
      reward_claimed_at: campaign.reward_claimed_at,
      reward_claim_voucher: rewardClaimVoucher,
      recent_helpers: recentHelpers,
    };
  }

  async listCustomerCampaignHelpers(
    authUserId: string,
    campaignId: string,
    page: number,
    pageSize: number,
  ) {
    const { campaign } = await this.getOwnedCampaignById(authUserId, campaignId);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const result = await customerProjectLogShareCampaignRepository.listValidAssists({
      campaign_id: campaign.id,
      from,
      to,
    });

    return {
      list: this.serializeRecentHelpers(result.list),
      pagination: {
        page,
        pageSize,
        total: result.count,
        totalPages: result.count ? Math.ceil(result.count / pageSize) : 0,
      },
    };
  }

  async getOrCreateCustomerAppointmentRewardCampaign(authUserId: string, projectId: string) {
    const { customer, project } = await this.getOwnedProject(authUserId, projectId);
    const matched = await this.getMatchingMarketingCampaign(projectId, "appointment_reward");

    if (!matched) {
      throw Errors.business(
        404,
        "当前项目未命中预约奖励活动",
        ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND,
      );
    }

    const payload = this.parseAppointmentRewardConfigPayload(matched.campaign.config_payload);
    let instance = await customerAppointmentRewardCampaignRepository.findByCampaignCustomerProject({
      campaign_id: matched.campaign.id,
      customer_id: customer.id,
      project_id: project.id,
    });

    if (!instance) {
      instance = await customerAppointmentRewardCampaignRepository.create({
        campaign_id: matched.campaign.id,
        customer_id: customer.id,
        project_id: project.id,
      });
    }

    const summary = this.buildAppointmentRewardSummary(matched.campaign);

    return {
      instance_id: instance.id,
      campaign_id: matched.campaign.id,
      campaign_type: "appointment_reward" as const,
      status: instance.status,
      reward_claim_status: instance.reward_claim_status,
      project_id: project.id,
      project_name: project.name,
      reward_title: summary.reward_title,
      reward_claim_instruction: summary.reward_claim_instruction,
      display_title: summary.display_title,
      display_subtitle: summary.display_subtitle,
    };
  }

  async getCustomerAppointmentRewardCampaign(authUserId: string, projectId: string) {
    const { customer, project } = await this.getOwnedProject(authUserId, projectId);
    const matched = await this.getMatchingMarketingCampaign(projectId, "appointment_reward");

    if (!matched) {
      throw Errors.business(
        404,
        "当前项目未命中预约奖励活动",
        ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND,
      );
    }

    let instance = await customerAppointmentRewardCampaignRepository.findByCampaignCustomerProject({
      campaign_id: matched.campaign.id,
      customer_id: customer.id,
      project_id: project.id,
    });

    if (instance) {
      instance = await this.ensureAppointmentRewardMetadata(instance);
    }

    const summary = this.buildAppointmentRewardSummary(matched.campaign);
    const voucher = instance ? this.buildAppointmentRewardVoucherPayload(instance) : null;

    return {
      instance_id: instance?.id ?? null,
      campaign_id: matched.campaign.id,
      campaign_type: "appointment_reward" as const,
      status: instance?.status ?? "active",
      reward_claim_status: instance?.reward_claim_status ?? "unclaimed",
      project_id: project.id,
      project_name: project.name,
      appointment_name: instance?.appointment_name ?? null,
      appointment_phone: instance?.appointment_phone ?? null,
      appointment_time: instance?.appointment_time ?? null,
      achieved_at: instance?.achieved_at ?? null,
      reward_claimed_at: instance?.reward_claimed_at ?? null,
      reward_title: summary.reward_title,
      reward_claim_instruction: summary.reward_claim_instruction,
      display_title: summary.display_title,
      display_subtitle: summary.display_subtitle,
      reward_claim_voucher: voucher,
    };
  }

  async submitCustomerAppointmentRewardCampaign(
    authUserId: string,
    projectId: string,
    input: CustomerAppointmentRewardSubmitInput,
  ) {
    const { customer, project } = await this.getOwnedProject(authUserId, projectId);
    const matched = await this.getMatchingMarketingCampaign(projectId, "appointment_reward");

    if (!matched) {
      throw Errors.business(
        404,
        "当前项目未命中预约奖励活动",
        ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND,
      );
    }

    const appointmentTime = new Date(input.appointment_time);
    if (Number.isNaN(appointmentTime.getTime())) {
      throw Errors.business(
        400,
        "预约时间不合法",
        ErrorCodes.APPOINTMENT_REWARD_INVALID_APPOINTMENT_TIME,
      );
    }

    const payload = this.parseAppointmentRewardConfigPayload(matched.campaign.config_payload);

    let instance = await customerAppointmentRewardCampaignRepository.findByCampaignCustomerProject({
      campaign_id: matched.campaign.id,
      customer_id: customer.id,
      project_id: project.id,
    });

    if (!instance) {
      instance = await customerAppointmentRewardCampaignRepository.create({
        campaign_id: matched.campaign.id,
        customer_id: customer.id,
        project_id: project.id,
      });
    }

    if (instance.status === "reward_claimed" || instance.reward_claim_status === "claimed") {
      throw Errors.business(
        409,
        "当前预约奖励已领奖",
        ErrorCodes.APPOINTMENT_REWARD_ALREADY_CLAIMED,
      );
    }

    if (instance.status === "achieved") {
      throw Errors.business(
        409,
        "当前预约奖励已达成",
        ErrorCodes.APPOINTMENT_REWARD_ALREADY_ACHIEVED,
      );
    }

    if (instance.appointment_name || instance.appointment_phone || instance.appointment_time) {
      throw Errors.business(
        409,
        "当前预约奖励已提交预约信息",
        ErrorCodes.APPOINTMENT_REWARD_ALREADY_SUBMITTED,
      );
    }

    instance = await customerAppointmentRewardCampaignRepository.update({
      id: instance.id,
      appointment_name: input.appointment_name,
      appointment_phone: normalizePhoneLike(input.appointment_phone),
      appointment_time: input.appointment_time,
      status: payload.achievement_mode === "appointment_submit" ? "achieved" : "active",
      reward_claim_status: "unclaimed",
      achieved_at: payload.achievement_mode === "appointment_submit" ? new Date().toISOString() : null,
      reward_claim_code: payload.achievement_mode === "appointment_submit" ? buildRewardClaimCode(instance) : null,
      reward_claim_voucher_token: payload.achievement_mode === "appointment_submit"
        ? buildRewardClaimVoucherToken()
        : null,
    });

    instance = await this.ensureAppointmentRewardMetadata(instance);

    return {
      instance_id: instance.id,
      status: instance.status,
      reward_claim_status: instance.reward_claim_status,
      achieved_at: instance.achieved_at,
    };
  }

  async getEmployeeProjectCampaignConfig(projectId: string) {
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

  async saveEmployeeProjectCampaignConfig(
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

  async updateEmployeeProjectCampaignConfigStatus(
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

  async listEmployeeShareCampaigns(
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
      list: result.list.map((item) => ({
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

  private async getScopeProjectMap(projectIds: string[]) {
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
      ((data || []) as Array<{ id: string; name: string | null }>).map((item) => [item.id, item]),
    );
  }

  private campaignVisibleToEmployee(
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
        .map((item) => item.project_id);
      return includeIds.some((item) => visibleProjectIds.includes(item));
    }

    const excluded = new Set(
      scopes.filter((item) => item.scope_mode === "exclude").map((item) => item.project_id),
    );
    return visibleProjectIds.some((item) => !excluded.has(item));
  }

  private async getMarketingCampaignOrThrow(id: string) {
    const campaign = await marketingCampaignRepository.findById(id);
    if (!campaign) {
      throw Errors.business(404, "营销活动不存在", ErrorCodes.SHARE_CAMPAIGN_NOT_FOUND);
    }
    return campaign;
  }

  private buildAppointmentRewardVoucherPayload(
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

  private async ensureAppointmentRewardMetadata(
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

  private async getMarketingCampaignTemplateOrThrow(id: string) {
    const template = await marketingCampaignTemplateRepository.findById(id);
    if (!template) {
      throw Errors.business(404, "营销模板不存在", ErrorCodes.MARKETING_TEMPLATE_NOT_FOUND);
    }
    return template;
  }

  private async resolveMarketingCampaignCreateInput(
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

  private buildMarketingCampaignScopeRows(
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

  async listMarketingCampaigns(
    authContext: AuthContext,
    query: MarketingCampaignListQuery,
  ) {
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );
    const result = await marketingCampaignRepository.list({
      campaignType: query.campaign_type,
      status: query.status,
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize,
    });

    const scopes = await marketingCampaignRepository.listScopesByCampaignIds(
      result.list.map((item) => item.id),
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

  async listMarketingCampaignTemplates(
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

  async getMarketingCampaignTemplateDetail(templateId: string) {
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

  async createMarketingCampaignTemplate(
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

  async updateMarketingCampaignTemplate(
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

  async updateMarketingCampaignTemplateStatus(
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

  async getMarketingCampaignDetail(authContext: AuthContext, campaignId: string) {
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );
    const campaign = await this.getMarketingCampaignOrThrow(campaignId);
    const scopes = await marketingCampaignRepository.listScopesByCampaignId(campaignId);

    if (!this.campaignVisibleToEmployee(campaign, scopes, visibleProjectIds)) {
      throw Errors.forbidden();
    }

    const templateSummary = campaign.template_id
      ? await marketingCampaignTemplateRepository.findById(campaign.template_id)
      : null;
    const templateSnapshot = await this.parseMarketingCampaignTemplateSnapshot(campaign.template_snapshot);
    const projectMap = await this.getScopeProjectMap(scopes.map((item) => item.project_id));
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
        .map((item) => item.project_id),
      include_project_ids: scopes
        .filter((item) => item.scope_mode === "include")
        .map((item) => item.project_id),
      scopes: scopes.map((item) => ({
        scope_mode: item.scope_mode,
        project_id: item.project_id,
        project_name: projectMap.get(item.project_id)?.name || null,
      })),
      summary: instanceSummary,
    };
  }

  async createMarketingCampaign(
    authContext: AuthContext,
    input: CreateMarketingCampaignInput,
  ) {
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
    if (scopeRows.length) {
      const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
        authContext,
        "project.update",
      );
      const invalid = visibleProjectIds
        ? scopeRows.some((item) => !visibleProjectIds.includes(item.project_id))
        : false;
      if (invalid) {
        throw Errors.forbidden();
      }
    }

    const campaign = await marketingCampaignRepository.create({
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

    await marketingCampaignRepository.replaceScopes(campaign.id, scopeRows);
    return this.getMarketingCampaignDetail(authContext, campaign.id);
  }

  async updateMarketingCampaign(
    authContext: AuthContext,
    campaignId: string,
    input: UpdateMarketingCampaignInput,
  ) {
    const existing = await this.getMarketingCampaignOrThrow(campaignId);
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.update",
    );
    const existingScopes = await marketingCampaignRepository.listScopesByCampaignId(campaignId);
    if (!this.campaignVisibleToEmployee(existing, existingScopes, visibleProjectIds)) {
      throw Errors.forbidden();
    }

    const scopeRows = this.buildMarketingCampaignScopeRows(input);
    if (scopeRows.length) {
      const invalid = visibleProjectIds
        ? scopeRows.some((item) => !visibleProjectIds.includes(item.project_id))
        : false;
      if (invalid) {
        throw Errors.forbidden();
      }
    }

    await marketingCampaignRepository.update({
      id: campaignId,
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
    await marketingCampaignRepository.replaceScopes(campaignId, scopeRows);
    return this.getMarketingCampaignDetail(authContext, campaignId);
  }

  async updateMarketingCampaignStatus(
    authContext: AuthContext,
    campaignId: string,
    input: MarketingCampaignStatusUpdateInput,
  ) {
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.update",
    );
    const existing = await this.getMarketingCampaignOrThrow(campaignId);
    const existingScopes = await marketingCampaignRepository.listScopesByCampaignId(campaignId);
    if (!this.campaignVisibleToEmployee(existing, existingScopes, visibleProjectIds)) {
      throw Errors.forbidden();
    }

    await marketingCampaignRepository.updateStatus(campaignId, input.status, authContext.employeeId);
    return this.getMarketingCampaignDetail(authContext, campaignId);
  }

  async listMarketingCampaignInstances(
    authContext: AuthContext,
    campaignId: string,
    query: MarketingCampaignInstanceListQuery,
  ) {
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );
    const campaign = await this.getMarketingCampaignOrThrow(campaignId);
    const scopes = await marketingCampaignRepository.listScopesByCampaignId(campaignId);
    if (!this.campaignVisibleToEmployee(campaign, scopes, visibleProjectIds)) {
      throw Errors.forbidden();
    }

    if (campaign.campaign_type === "appointment_reward") {
      const result = await customerAppointmentRewardCampaignRepository.listForEmployee({
        campaignId,
        projectIds: visibleProjectIds,
        status: query.status,
        rewardClaimStatus: query.rewardClaimStatus,
        keyword: query.keyword,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        page: query.page,
        pageSize: query.pageSize,
      });

      return {
        list: result.list,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          totalPages: result.total ? Math.ceil(result.total / query.pageSize) : 0,
        },
      };
    }

    const result = await customerProjectLogShareCampaignRepository.listForEmployee({
      campaignId,
      projectIds: visibleProjectIds,
      status: query.status,
      rewardClaimStatus: query.rewardClaimStatus,
      keyword: query.keyword,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      list: result.list.map((item) => ({
        ...item,
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

  async getEmployeeAppointmentRewardCampaignDetail(instanceId: string) {
    const instance = await customerAppointmentRewardCampaignRepository.findById(instanceId);
    if (!instance) {
      throw Errors.business(
        404,
        "预约奖励实例不存在",
        ErrorCodes.APPOINTMENT_REWARD_INSTANCE_NOT_FOUND,
      );
    }

    const campaign = await this.getMarketingCampaignOrThrow(instance.campaign_id);
    const project = await this.getOwnedProjectById(instance.project_id);
    const customer = await this.getCustomerById(instance.customer_id);
    const finalInstance = await this.ensureAppointmentRewardMetadata(instance);
    const voucher = this.buildAppointmentRewardVoucherPayload(finalInstance);

    return {
      instance_id: finalInstance.id,
      campaign_id: finalInstance.campaign_id,
      campaign_type: "appointment_reward" as const,
      customer_id: finalInstance.customer_id,
      customer_name: customer.name,
      project_id: finalInstance.project_id,
      project_name: project.name,
      appointment_name: finalInstance.appointment_name,
      appointment_phone: finalInstance.appointment_phone,
      appointment_time: finalInstance.appointment_time,
      status: finalInstance.status,
      reward_claim_status: finalInstance.reward_claim_status,
      reward_claim_code: finalInstance.reward_claim_code,
      achieved_at: finalInstance.achieved_at,
      reward_claimed_at: finalInstance.reward_claimed_at,
      reward_title: getAppointmentRewardTitle(campaign.reward_title),
      reward_claim_instruction: getAppointmentRewardClaimInstruction(campaign.reward_claim_instruction),
      voucher: voucher
        ? {
          voucher_token: voucher.voucher_token,
          status: voucher.status,
          expires_at: voucher.expires_at,
        }
        : null,
      created_at: finalInstance.created_at,
      updated_at: finalInstance.updated_at,
    };
  }

  async confirmEmployeeAppointmentRewardArrive(
    instanceId: string,
  ) {
    const instance = await customerAppointmentRewardCampaignRepository.findById(instanceId);
    if (!instance) {
      throw Errors.business(
        404,
        "预约奖励实例不存在",
        ErrorCodes.APPOINTMENT_REWARD_INSTANCE_NOT_FOUND,
      );
    }

    if (instance.status === "reward_claimed" || instance.reward_claim_status === "claimed") {
      throw Errors.business(
        409,
        "当前预约奖励已领奖",
        ErrorCodes.APPOINTMENT_REWARD_ALREADY_CLAIMED,
      );
    }

    if (instance.status === "achieved") {
      throw Errors.business(
        409,
        "当前预约奖励已达成",
        ErrorCodes.APPOINTMENT_REWARD_ALREADY_ACHIEVED,
      );
    }

    const campaign = await this.getMarketingCampaignOrThrow(instance.campaign_id);
    const payload = this.parseAppointmentRewardConfigPayload(campaign.config_payload);

    if (payload.achievement_mode !== "store_checkin") {
      throw Errors.business(
        409,
        "当前活动无需确认到店",
        ErrorCodes.APPOINTMENT_REWARD_ALREADY_ACHIEVED,
      );
    }

    const updated = await customerAppointmentRewardCampaignRepository.update({
      id: instance.id,
      status: "achieved",
      reward_claim_status: "unclaimed",
      achieved_at: new Date().toISOString(),
      reward_claim_code: instance.reward_claim_code || buildRewardClaimCode(instance),
      reward_claim_voucher_token: instance.reward_claim_voucher_token || buildRewardClaimVoucherToken(),
    });

    return {
      instance_id: updated.id,
      status: updated.status,
      reward_claim_status: updated.reward_claim_status,
      achieved_at: updated.achieved_at,
    };
  }

  async claimEmployeeAppointmentReward(
    instanceId: string,
    employeeId: string,
    input: EmployeeAppointmentRewardClaimInput,
  ) {
    const instance = await customerAppointmentRewardCampaignRepository.findById(instanceId);
    if (!instance) {
      throw Errors.business(
        404,
        "预约奖励实例不存在",
        ErrorCodes.APPOINTMENT_REWARD_INSTANCE_NOT_FOUND,
      );
    }

    const finalInstance = await this.ensureAppointmentRewardMetadata(instance);
    const campaign = await this.getMarketingCampaignOrThrow(finalInstance.campaign_id);
    const payload = this.parseAppointmentRewardConfigPayload(campaign.config_payload);

    if (finalInstance.status === "reward_claimed" || finalInstance.reward_claim_status === "claimed") {
      throw Errors.business(
        409,
        "当前预约奖励已领奖",
        ErrorCodes.APPOINTMENT_REWARD_ALREADY_CLAIMED,
      );
    }

    if (finalInstance.status !== "achieved") {
      throw Errors.business(
        409,
        payload.achievement_mode === "store_checkin"
          ? "当前活动需确认到店后才能领奖"
          : "当前预约奖励未达成",
        payload.achievement_mode === "store_checkin"
          ? ErrorCodes.APPOINTMENT_REWARD_STORE_CHECKIN_REQUIRED
          : ErrorCodes.APPOINTMENT_REWARD_ALREADY_SUBMITTED,
      );
    }

    const updated = await customerAppointmentRewardCampaignRepository.update({
      id: finalInstance.id,
      status: "reward_claimed",
      reward_claim_status: "claimed",
      reward_claimed_at: new Date().toISOString(),
      reward_claimed_by_employee_id: employeeId,
      reward_claim_channel: input.channel,
    });

    return {
      instance_id: updated.id,
      status: updated.status,
      reward_claim_status: updated.reward_claim_status,
      reward_claimed_at: updated.reward_claimed_at,
    };
  }

  async getEmployeeShareCampaignDetail(campaignId: string) {
    const campaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
    if (!campaign) {
      throw Errors.business(404, "助力活动不存在", ErrorCodes.SHARE_CAMPAIGN_NOT_FOUND);
    }

    const finalCampaign = await this.ensureCampaignPhase2Metadata(campaign);
    const detail = await this.buildCampaignPublicDetail(finalCampaign.share_token);
    const owner = await this.getCustomerById(finalCampaign.customer_id);
    const recentHelpers = await this.getRecentHelpers(finalCampaign.id, 3);
    const voucher = this.buildRewardClaimVoucherPayload(finalCampaign);

    return {
      campaign_id: finalCampaign.id,
      project_id: finalCampaign.project_id,
      project_name: detail.project_name,
      customer_id: finalCampaign.customer_id,
      customer_name: owner.name,
      log_id: finalCampaign.log_id,
      log_title: detail.node_name || detail.stage_label || "施工日志更新",
      status: finalCampaign.status,
      reward_claim_status: finalCampaign.reward_claim_status,
      assist_count: finalCampaign.assist_count,
      target_assist_count: finalCampaign.target_assist_count,
      remaining_count: Math.max(finalCampaign.target_assist_count - finalCampaign.assist_count, 0),
      reward_title: getCampaignRewardTitle(finalCampaign),
      reward_remark: getCampaignRewardRemark(finalCampaign),
      reward_claim_instruction: finalCampaign.reward_claim_instruction,
      reward_claim_channel: finalCampaign.reward_claim_channel,
      reward_claim_code: finalCampaign.reward_claim_code,
      reward_claimed_at: finalCampaign.reward_claimed_at,
      voucher: voucher
        ? {
          voucher_token: voucher.voucher_token,
          status: voucher.status,
          expires_at: voucher.expires_at,
        }
        : null,
      recent_helpers: recentHelpers,
      started_at: finalCampaign.created_at,
      valid_until: finalCampaign.valid_until,
    };
  }

  async listEmployeeShareCampaignHelpers(campaignId: string, page: number, pageSize: number) {
    const campaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
    if (!campaign) {
      throw Errors.business(404, "助力活动不存在", ErrorCodes.SHARE_CAMPAIGN_NOT_FOUND);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const result = await customerProjectLogShareCampaignRepository.listValidAssists({
      campaign_id: campaign.id,
      from,
      to,
    });

    return {
      list: this.serializeRecentHelpers(result.list),
      pagination: {
        page,
        pageSize,
        total: result.count,
        totalPages: result.count ? Math.ceil(result.count / pageSize) : 0,
      },
    };
  }

  async updateEmployeeShareCampaignStatus(
    campaignId: string,
    input: PostEmployeeShareCampaignStatusInput,
  ) {
    const campaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
    if (!campaign) {
      throw Errors.business(404, "助力活动不存在", ErrorCodes.SHARE_CAMPAIGN_NOT_FOUND);
    }

    if (campaign.status === "closed") {
      throw Errors.business(409, "当前活动已关闭", ErrorCodes.SHARE_CAMPAIGN_ALREADY_CLOSED);
    }

    if (campaign.status === "reward_claimed") {
      throw Errors.business(409, "已领奖活动不支持关闭", ErrorCodes.SHARE_CAMPAIGN_STATUS_INVALID);
    }

    const updated = await customerProjectLogShareCampaignRepository.updateStatus({
      id: campaign.id,
      status: input.status,
      closed_reason: input.reason,
    });

    return {
      campaign_id: updated.id,
      status: updated.status,
      reward_claim_status: updated.reward_claim_status,
      closed_reason: updated.closed_reason,
    };
  }

  async getEmployeeShareCampaignStatsSummary(
    authContext: AuthContext,
    query: EmployeeShareCampaignStatsSummaryQuery,
  ) {
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );

    const summary = await customerProjectLogShareCampaignRepository.getStatsSummary({
      projectIds: visibleProjectIds,
      projectId: query.projectId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    return {
      ...summary,
      total_share_open_count: null,
      total_share_save_count: null,
      achievement_rate: summary.campaign_count
        ? Number((summary.achieved_count / summary.campaign_count).toFixed(4))
        : 0,
      claim_rate: summary.achieved_count
        ? Number((summary.reward_claimed_count / summary.achieved_count).toFixed(4))
        : 0,
    };
  }

  async getCampaignMetaForEmployeeClaim(campaignId: string) {
    const shareCampaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
    if (shareCampaign) {
      return {
        id: shareCampaign.id,
        project_id: shareCampaign.project_id,
        status: shareCampaign.status,
        campaign_type: "share_assist" as const,
      };
    }

    const appointmentCampaign = await customerAppointmentRewardCampaignRepository.findById(campaignId);
    if (appointmentCampaign) {
      return {
        id: appointmentCampaign.id,
        project_id: appointmentCampaign.project_id,
        status: appointmentCampaign.status,
        campaign_type: "appointment_reward" as const,
      };
    }

    throw Errors.badRequest("活动实例不存在");
  }

  async getVoucherMetaForEmployeeClaim(voucherToken: string) {
    const campaign = await customerProjectLogShareCampaignRepository.findByVoucherToken(
      normalizeVoucherToken(voucherToken),
    );
    if (!campaign) {
      throw Errors.badRequest("领取凭证不存在");
    }

    const finalCampaign = await this.ensureCampaignPhase2Metadata(campaign);
    return {
      id: finalCampaign.id,
      project_id: finalCampaign.project_id,
      status: finalCampaign.status,
      reward_claim_voucher_token: finalCampaign.reward_claim_voucher_token,
    };
  }

  async getEmployeeVoucherDetail(voucherToken: string) {
    const campaign = await customerProjectLogShareCampaignRepository.findByVoucherToken(
      normalizeVoucherToken(voucherToken),
    );
    if (!campaign) {
      throw Errors.badRequest("领取凭证不存在");
    }

    const finalCampaign = await this.ensureCampaignPhase2Metadata(campaign);
    const detail = await this.buildCampaignPublicDetail(finalCampaign.share_token);
    const owner = await this.getCustomerById(finalCampaign.customer_id);
    const voucher = this.buildRewardClaimVoucherPayload(finalCampaign);
    const voucherStatus = voucher?.status || "invalid";

    let canClaim = true;
    let claimBlockReason: "already_claimed" | "voucher_expired" | "campaign_not_achieved" | "campaign_closed" | "voucher_invalid" | null = null;

    if (!voucher) {
      canClaim = false;
      claimBlockReason = "voucher_invalid";
    } else if (voucher.status === "claimed") {
      canClaim = false;
      claimBlockReason = "already_claimed";
    } else if (voucher.status === "expired") {
      canClaim = false;
      claimBlockReason = "voucher_expired";
    } else if (!this.isCampaignRewardClaimable(finalCampaign)) {
      canClaim = false;
      claimBlockReason = finalCampaign.status === "closed"
        ? "campaign_closed"
        : "campaign_not_achieved";
    }

    return {
      voucher_token: finalCampaign.reward_claim_voucher_token,
      campaign_id: finalCampaign.id,
      project_id: finalCampaign.project_id,
      status: finalCampaign.status,
      reward_claim_status: finalCampaign.reward_claim_status,
      claim_code: finalCampaign.reward_claim_code,
      customer_name: maskDisplayName(owner.name),
      project_name: detail.project_name,
      reward_title: getCampaignRewardTitle(finalCampaign),
      reward_claim_channel: finalCampaign.reward_claim_channel,
      reward_claim_instruction: finalCampaign.reward_claim_instruction,
      can_claim: canClaim,
      claim_block_reason: claimBlockReason,
      claimed_at: finalCampaign.reward_claimed_at,
      expires_at: voucher?.expires_at || null,
      voucher_status: voucherStatus,
    };
  }

  async claimCampaignReward(
    campaignId: string,
    employeeId: string,
    input: ClaimCustomerProjectLogShareCampaignInput,
  ) {
    const campaign = await this.ensureCampaignPhase2Metadata(
      await customerProjectLogShareCampaignRepository.findById(campaignId)
      || (() => {
        throw Errors.badRequest("分享活动不存在");
      })(),
    );

    if (campaign.status === "reward_claimed" || campaign.reward_claim_status === "claimed") {
      throw Errors.badRequest("当前活动奖励已领取");
    }

    if (!this.isCampaignRewardClaimable(campaign)) {
      throw Errors.badRequest(campaign.status === "closed" ? "当前活动已关闭" : "当前活动未达到领奖状态");
    }

    if (!campaign.reward_claim_code || input.claim_code !== campaign.reward_claim_code) {
      throw Errors.badRequest("领奖码不匹配");
    }

    const updatedCampaign = await customerProjectLogShareCampaignRepository.updateRewardMetadata({
      id: campaign.id,
      status: "reward_claimed",
      reward_claim_status: "claimed",
      reward_claim_channel: input.channel,
      reward_claimed_at: new Date().toISOString(),
      reward_claimed_by_employee_id: employeeId,
    });

    return {
      campaign_id: updatedCampaign.id,
      status: updatedCampaign.status,
      reward_claim_status: updatedCampaign.reward_claim_status,
      reward_claimed_at: updatedCampaign.reward_claimed_at,
    };
  }

  async claimCampaignRewardByVoucher(
    voucherToken: string,
    employeeId: string,
    input: ClaimCustomerProjectLogShareVoucherInput,
  ) {
    const campaign = await customerProjectLogShareCampaignRepository.findByVoucherToken(
      normalizeVoucherToken(voucherToken),
    );
    if (!campaign) {
      throw Errors.badRequest("领取凭证不存在");
    }

    const finalCampaign = await this.ensureCampaignPhase2Metadata(campaign);
    const voucher = this.buildRewardClaimVoucherPayload(finalCampaign);
    if (!voucher || !finalCampaign.reward_claim_voucher_token) {
      throw Errors.badRequest("领取凭证不存在");
    }

    if (voucher.status === "claimed" || finalCampaign.reward_claim_status === "claimed") {
      throw Errors.badRequest("当前活动奖励已领取");
    }

    if (voucher.status === "expired") {
      throw Errors.badRequest("领取凭证已过期");
    }

    if (!this.isCampaignRewardClaimable(finalCampaign)) {
      throw Errors.badRequest(
        finalCampaign.status === "closed" ? "当前活动已关闭" : "当前活动未达到领奖状态",
      );
    }

    const updatedCampaign = await customerProjectLogShareCampaignRepository.updateRewardMetadata({
      id: finalCampaign.id,
      status: "reward_claimed",
      reward_claim_status: "claimed",
      reward_claim_channel: input.channel,
      reward_claimed_at: new Date().toISOString(),
      reward_claimed_by_employee_id: employeeId,
    });

    return {
      voucher_token: finalCampaign.reward_claim_voucher_token,
      campaign_id: updatedCampaign.id,
      status: updatedCampaign.status,
      reward_claim_status: updatedCampaign.reward_claim_status,
      reward_claimed_at: updatedCampaign.reward_claimed_at,
    };
  }
}

export const customerProjectLogShareService = new CustomerProjectLogShareService();
