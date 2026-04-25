import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { customerProjectLogShareCampaignRepository, type CustomerProjectLogShareCampaignRow } from "@/repositories/customer-project-log-share-campaigns";
import { customerProjectLogShareRepository } from "@/repositories/customer-project-log-shares";
import type {
  AssistCustomerProjectLogShareCampaignInput,
  CreateCustomerProjectLogShareRecordInput,
  CreateCustomerProjectLogShareCampaignInput,
  GenerateCustomerProjectLogShareCopyInput,
  GetCustomerProjectLogShareCardQuery,
  OpenCustomerProjectLogShareCampaignInput,
} from "@/schema/customer-project-log-share";
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
};

type CampaignOwnerRow = {
  id: string;
  name: string | null;
  user_id: string | null;
};

type UserProfileRow = {
  auth_user_id: string;
  nickname: string | null;
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
    };
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
      .select("auth_user_id, nickname")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询用户资料失败", error);
    }

    return (data || null) as UserProfileRow | null;
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
        channel: input?.channel ?? "timeline",
        target_assist_count: getCustomerProjectLogShareTargetAssistCount(),
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
    const { context, campaign } = await this.resolveShareCampaignForOwnedLog({
      authUserId,
      projectId,
      logId,
      channel: "timeline",
    });
    const copies = await this.requestAiCopies(context, input);

    return {
      copies,
      campaign: this.buildCampaignSummary(campaign),
    };
  }

  async getShareCard(
    authUserId: string,
    projectId: string,
    logId: string,
    query?: GetCustomerProjectLogShareCardQuery,
  ) {
    const { context, campaign } = await this.resolveShareCampaignForOwnedLog({
      authUserId,
      projectId,
      logId,
      shareToken: query?.share_token,
      channel: "timeline",
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
      share_reward_title: buildCampaignRewardTitle(campaign.target_assist_count),
      share_reward_code: buildShareRewardCode({
        customerId: context.customer_id,
        projectId: context.project_id,
        logId: context.log_id,
      }),
      share_reward_remark: DEFAULT_SHARE_REWARD_REMARK,
      share_token: campaign.share_token,
      campaign: this.buildCampaignSummary(campaign),
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

    return this.buildCampaignSummary(campaign);
  }

  async getShareCampaignDetail(shareToken: string) {
    const detail = await this.buildCampaignPublicDetail(shareToken);
    const campaign = detail.campaign;

    return {
      campaign_id: campaign.id,
      share_token: campaign.share_token,
      status: campaign.status,
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
      reward_title: buildCampaignRewardTitle(campaign.target_assist_count),
      reward_remark: DEFAULT_SHARE_REWARD_REMARK,
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
    await customerProjectLogShareCampaignRepository.createOpen({
      campaign_id: campaign.id,
      share_token: campaign.share_token,
      visitor_auth_user_id: visitor.authUserId ?? null,
      visitor_openid: visitor.openid ?? null,
      visitor_device_id: null,
      visitor_ip: visitor.ip ?? null,
      source: input.source,
    });

    return {
      campaign_id: campaign.id,
      share_token: campaign.share_token,
      assist_count: campaign.assist_count,
      target_assist_count: campaign.target_assist_count,
      remaining_count: Math.max(campaign.target_assist_count - campaign.assist_count, 0),
      status: campaign.status,
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
    const campaign = await this.getCampaignByToken(input.share_token);

    if (campaign.status !== "active") {
      if (campaign.status === "achieved") {
        throw Errors.badRequest("当前活动已达标");
      }

      if (campaign.status === "reward_claimed") {
        throw Errors.badRequest("当前活动奖励已领取");
      }

      throw Errors.badRequest("当前活动已关闭");
    }

    const owner = await this.getCustomerById(campaign.customer_id);
    if (owner.user_id && owner.user_id === helper.authUserId) {
      throw Errors.badRequest("不能给自己助力");
    }

    const existingAssist = await customerProjectLogShareCampaignRepository.findAssist({
      campaign_id: campaign.id,
      helper_auth_user_id: helper.authUserId,
      helper_openid: helper.openid ?? null,
    });
    if (existingAssist) {
      throw Errors.badRequest("你已经助力过了");
    }

    await customerProjectLogShareCampaignRepository.createAssist({
      campaign_id: campaign.id,
      share_token: campaign.share_token,
      helper_auth_user_id: helper.authUserId,
      helper_openid: helper.openid ?? null,
      helper_device_id: null,
      helper_ip: helper.ip ?? null,
      source: input.source,
    });

    const assistCount = await customerProjectLogShareCampaignRepository.countAssists(campaign.id);
    const nextStatus = assistCount >= campaign.target_assist_count ? "achieved" : "active";
    const updatedCampaign = await customerProjectLogShareCampaignRepository.updateMetrics({
      id: campaign.id,
      assist_count: assistCount,
      assist_uv: assistCount,
      status: nextStatus,
      achieved_at: nextStatus === "achieved"
        ? (campaign.achieved_at || new Date().toISOString())
        : null,
    });

    return {
      success: true,
      campaign_id: updatedCampaign.id,
      share_token: updatedCampaign.share_token,
      status: updatedCampaign.status,
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
    const { context, campaign } = await this.resolveShareCampaignForOwnedLog({
      authUserId,
      projectId,
      logId,
      channel: "timeline",
    });
    const record = await customerProjectLogShareRepository.create({
      customer_id: context.customer_id,
      project_id: context.project_id,
      log_id: context.log_id,
      selected_copy_id: input.copy_id ?? null,
      selected_copy_text: input.copy_text ?? null,
      action: input.action,
    });

    if (input.action === "save_image") {
      await customerProjectLogShareCampaignRepository.touchPosterSavedAt(campaign.id);
    }

    return {
      ...record,
      campaign: this.buildCampaignSummary(campaign),
    };
  }
}

export const customerProjectLogShareService = new CustomerProjectLogShareService();
