import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { customerProjectLogShareRepository } from "@/repositories/customer-project-log-shares";
import type {
  CreateCustomerProjectLogShareRecordInput,
  GenerateCustomerProjectLogShareCopyInput,
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

  async generateShareCopies(
    authUserId: string,
    projectId: string,
    logId: string,
    input: GenerateCustomerProjectLogShareCopyInput,
  ) {
    const context = await this.getOwnedProjectLogContext(authUserId, projectId, logId);
    const copies = await this.requestAiCopies(context, input);

    return {
      copies,
    };
  }

  async getShareCard(authUserId: string, projectId: string, logId: string) {
    const context = await this.getOwnedProjectLogContext(authUserId, projectId, logId);
    return {
      project_name: context.project_name,
      stage_code: context.stage_code,
      stage_label: context.stage_label,
      log_title: context.node_name || context.stage_label || "施工日志更新",
      log_content: context.log_content,
      images: context.log_images,
      style_tags: context.project_style_tags,
      designer_name: context.designer_name,
      share_reward_title: DEFAULT_SHARE_REWARD_TITLE,
      share_reward_code: buildShareRewardCode({
        customerId: context.customer_id,
        projectId: context.project_id,
        logId: context.log_id,
      }),
      share_reward_remark: DEFAULT_SHARE_REWARD_REMARK,
    };
  }

  async createShareRecord(
    authUserId: string,
    projectId: string,
    logId: string,
    input: CreateCustomerProjectLogShareRecordInput,
  ) {
    const context = await this.getOwnedProjectLogContext(authUserId, projectId, logId);
    return customerProjectLogShareRepository.create({
      customer_id: context.customer_id,
      project_id: context.project_id,
      log_id: context.log_id,
      selected_copy_id: input.copy_id ?? null,
      selected_copy_text: input.copy_text ?? null,
      action: input.action,
    });
  }
}

export const customerProjectLogShareService = new CustomerProjectLogShareService();
