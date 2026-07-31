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
  getShareCopyLengthInstruction,
  normalizeShareCopies,
} from "../share-copy-policy";

import {
  DEFAULT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE,
  DEFAULT_SHARE_CAMPAIGN_PAGE,
  DEFAULT_SHARE_REWARD_REMARK,
  DEFAULT_SHARE_REWARD_TITLE,
  type CustomerProjectLogShareContext,
  type GeneratedShareCopy,
} from './shared-types';

export function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export async function getAiEndpoint() {
  const hasDeepSeekApiKey = Boolean(await systemSettingsService.getSecretString("DEEPSEEK_API_KEY"));
  return (await systemSettingsService.getString("AI_CHAT_COMPLETIONS_URL"))
    || (hasDeepSeekApiKey
      ? "https://api.deepseek.com/chat/completions"
      : "https://api.openai.com/v1/chat/completions");
}

export async function getAiApiKey(endpoint: string) {
  const envNames = endpoint.includes("api.deepseek.com")
    ? ["DEEPSEEK_API_KEY", "AI_API_KEY"]
    : ["AI_API_KEY", "DEEPSEEK_API_KEY"];

  for (const name of envNames) {
    const value = await systemSettingsService.getSecretString(name);
    if (value) return value;
  }

  return firstNonEmptyEnv(envNames);
}

export async function getAiModel(endpoint: string) {
  const explicit = await systemSettingsService.getString("AI_MODEL");
  if (explicit) {
    return explicit;
  }

  return endpoint.includes("api.deepseek.com") ? "deepseek-chat" : "";
}

export async function getWechatShareCampaignPage() {
  return systemSettingsService.getString(
    "WECHAT_SHARE_CAMPAIGN_PAGE",
    DEFAULT_SHARE_CAMPAIGN_PAGE,
  );
}

export async function getWechatShareCampaignClaimVoucherPage() {
  return systemSettingsService.getString(
    "WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE",
    DEFAULT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE,
  );
}

export async function getCustomerProjectLogShareTargetAssistCount() {
  const parsed = await systemSettingsService.getNumber(
    "CUSTOMER_LOG_SHARE_TARGET_ASSIST_COUNT",
    10,
  );
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return 10;
}

export function normalizeRelation<T extends Record<string, unknown>>(
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

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeProjectLogImages(images: unknown) {
  return resolveStoredFileUrlList(images);
}

export function buildShareRewardCode(input: {
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

export function buildCampaignRewardTitle(targetAssistCount: number) {
  return `${targetAssistCount}人助力解锁${DEFAULT_SHARE_REWARD_TITLE}`;
}

export function buildDefaultConfigRewardTitle(targetAssistCount: number) {
  return buildCampaignRewardTitle(targetAssistCount);
}

export function getCampaignRewardTitle(campaign: Pick<CustomerProjectLogShareCampaignRow, "reward_title" | "target_assist_count">) {
  return campaign.reward_title?.trim() || buildCampaignRewardTitle(campaign.target_assist_count);
}

export function getCampaignRewardRemark(campaign: Pick<CustomerProjectLogShareCampaignRow, "reward_remark">) {
  return campaign.reward_remark?.trim() || DEFAULT_SHARE_REWARD_REMARK;
}

export function buildRewardClaimCode(campaign: Pick<CustomerProjectLogShareCampaignRow, "id" | "created_at">) {
  const baseDate = new Date(campaign.created_at);
  const dateCode = [
    String(baseDate.getFullYear()),
    String(baseDate.getMonth() + 1).padStart(2, "0"),
    String(baseDate.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = campaign.id.replace(/-/g, "").slice(0, 4).toUpperCase();

  return `MJ-CLAIM-${dateCode}-${suffix}`;
}

export function buildRewardClaimVoucherToken() {
  return `rcv_${randomUUID().replace(/-/g, "")}`;
}

export function getDefaultRewardClaimInstruction(targetAssistCount: number) {
  return `邀请满${targetAssistCount}位好友助力后，到店出示领奖码领取礼品`;
}

export function getAppointmentRewardTitle(value: string | null | undefined) {
  return value?.trim() || "预约到店即可领取礼品";
}

export function getAppointmentRewardClaimInstruction(value: string | null | undefined) {
  return value?.trim() || "提交预约信息并到店后可领取礼品";
}

export function normalizePhoneLike(value: string) {
  return value.trim();
}

export function maskDisplayName(value: string | null | undefined) {
  const text = value?.trim() || "";
  if (!text) {
    return "好友";
  }

  if (text.length === 1) {
    return `${text}*`;
  }

  return `${text.slice(0, 1)}*`;
}

export function buildShareToken() {
  return `st_${randomUUID().replace(/-/g, "")}`;
}

export function normalizeShareToken(input: string) {
  const value = input.trim();
  if (!value) {
    return value;
  }

  if (value.startsWith("st_")) {
    return value;
  }

  return `st_${value}`;
}

export function buildMiniProgramScene(shareToken: string) {
  return normalizeShareToken(shareToken).replace(/^st_/, "").slice(0, 32);
}

export function normalizeVoucherToken(input: string) {
  const value = input.trim();
  if (!value) {
    return value;
  }

  if (value.startsWith("rcv_")) {
    return value;
  }

  return `rcv_${value}`;
}

export function buildVoucherMiniProgramScene(voucherToken: string) {
  return normalizeVoucherToken(voucherToken).replace(/^rcv_/, "").slice(0, 32);
}

export function buildCopyPrompt(
  context: CustomerProjectLogShareContext,
  input: GenerateCustomerProjectLogShareCopyInput,
) {
  return `你是装修进度分享文案助手。请基于下面这条真实施工日志，生成 3 条适合客户发朋友圈的中文短文案。

要求：
1. 文风选择：${input.style}
2. 长度选择：${input.length}
3. ${getShareCopyLengthInstruction(input.length)}
4. 真实、温暖、克制，不要销售腔。
5. 不要夸大宣传，不要编造未提供的信息。
6. 不要出现“欢迎咨询”“扫码联系”等广告导流话术。
7. 严格返回 JSON：
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

export function fallbackCopies(
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

export function parseCopiesResult(
  rawContent: string,
  context: CustomerProjectLogShareContext,
  length: GenerateCustomerProjectLogShareCopyInput["length"],
) {
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

    return normalizeShareCopies(copies, length, fallbackCopies(context));
  } catch {
    return normalizeShareCopies([], length, fallbackCopies(context));
  }
}
