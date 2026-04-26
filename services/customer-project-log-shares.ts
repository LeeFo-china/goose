import { randomUUID } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerProjectLogShareCampaignRepository, type CustomerProjectLogShareCampaignRow } from "@/repositories/customer-project-log-share-campaigns";
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
  config_id: string;
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

function getAiEndpoint() {
  return firstNonEmptyEnv([
    "AI_CHAT_COMPLETIONS_URL",
    "DEEPSEEK_CHAT_COMPLETIONS_URL",
  ])
    || (process.env.DEEPSEEK_API_KEY?.trim()
      ? "https://api.deepseek.com/chat/completions"
      : "https://api.openai.com/v1/chat/completions");
}

function getAiApiKey() {
  const endpoint = getAiEndpoint();
  const envNames = endpoint.includes("api.deepseek.com")
    ? ["DEEPSEEK_API_KEY", "AI_API_KEY"]
    : ["AI_API_KEY", "DEEPSEEK_API_KEY"];

  return firstNonEmptyEnv(envNames);
}

function getAiModel() {
  const endpoint = getAiEndpoint();
  const envNames = endpoint.includes("api.deepseek.com")
    ? ["DEEPSEEK_MODEL", "AI_MODEL"]
    : ["AI_MODEL", "DEEPSEEK_MODEL"];
  const explicit = firstNonEmptyEnv(envNames);
  if (explicit) {
    return explicit;
  }

  return endpoint.includes("api.deepseek.com") ? "deepseek-chat" : "";
}

function getWechatShareCampaignPage() {
  return process.env.WECHAT_SHARE_CAMPAIGN_PAGE?.trim() || DEFAULT_SHARE_CAMPAIGN_PAGE;
}

function getWechatShareCampaignClaimVoucherPage() {
  return process.env.WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE?.trim()
    || DEFAULT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE;
}

function getCustomerProjectLogShareTargetAssistCount() {
  const raw = process.env.CUSTOMER_LOG_SHARE_TARGET_ASSIST_COUNT?.trim();
  const parsed = raw ? Number(raw) : NaN;
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

    const appId = process.env.WECHAT_APPID?.trim();
    const secret = process.env.WECHAT_SECRET?.trim();
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

  private async getEffectiveProjectConfig(projectId: string) {
    const config = await this.getProjectConfig(projectId);
    const blockReason = this.getConfigBlockReason(config);
    return {
      raw: config,
      blockReason,
      effective: config && !blockReason ? this.buildEffectiveConfig(config) : null,
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
      .select("id, project_id, stage_code, node_name, content, images, created_at")
      .eq("id", logId)
      .eq("project_id", projectId)
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
      .select("id, project_id, stage_code, node_name, content, images, created_at")
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
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, project_id, stage_code, node_name, content, images, created_at")
      .eq("project_id", projectId)
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
    const endpoint = getAiEndpoint();
    const apiKey = getAiApiKey();
    const model = getAiModel();

    if (!endpoint || !apiKey || !model) {
      return fallbackCopies(context);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.8,
          response_format: { type: "json_object" },
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
        }),
        signal: controller.signal,
      });

      const result = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (!response.ok) {
        return fallbackCopies(context);
      }

      const rawContent = result.choices?.[0]?.message?.content || "";
      return parseCopiesResult(rawContent, context);
    } catch {
      return fallbackCopies(context);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async ensureShareCampaign(
    context: CustomerProjectLogShareContext,
    input?: CreateCustomerProjectLogShareCampaignInput,
  ) {
    const configResult = await this.getEffectiveProjectConfig(context.project_id);
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
      .select("id, project_id, stage_code, node_name, content, images, created_at")
      .eq("id", campaign.log_id)
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
          page: getWechatShareCampaignPage(),
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
          page: getWechatShareCampaignClaimVoucherPage(),
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
    const configResult = await this.getEffectiveProjectConfig(projectId);
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
        config_enabled: Boolean(configResult.raw?.enabled),
        config_status: configResult.raw?.config_status || null,
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
      config_enabled: Boolean(configResult.raw?.enabled),
      config_status: configResult.raw?.config_status || null,
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
    const campaign = await customerProjectLogShareCampaignRepository.findById(campaignId);
    if (!campaign) {
      throw Errors.badRequest("分享活动不存在");
    }

    return {
      id: campaign.id,
      project_id: campaign.project_id,
      status: campaign.status,
    };
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
