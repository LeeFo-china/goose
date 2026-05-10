import { Errors } from "@/errors/error-factory";
import { aiGateway } from "@/services/ai-gateway";
import type {
  MarketingPageBlockAiFillInput,
  MarketingPageCreateAiFillInput,
  MarketingPageSettingsAiFillInput,
} from "@/schema/marketing-pages";
import { systemSettingsService } from "@/services/system-settings";

type AiMessageRole = "system" | "user" | "assistant";

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OpenAiRequestBody = {
  model: string;
  temperature: number;
  messages: Array<{ role: AiMessageRole; content: string }>;
  response_format?: { type: "json_object" };
};

type FieldDefinition = {
  type: "string" | "text" | "select";
  label: string;
  maxLength: number;
  options?: string[];
};

const BLOCK_AI_FIELD_DEFINITIONS: Record<string, Record<string, FieldDefinition>> = {
  hero: {
    kicker: { type: "string", label: "角标", maxLength: 12 },
    title: { type: "string", label: "标题", maxLength: 24 },
    subtitle: { type: "text", label: "副标题", maxLength: 90 },
    buttonText: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  image: {
    caption: { type: "string", label: "图片说明", maxLength: 60 },
  },
  text: {
    title: { type: "string", label: "标题", maxLength: 24 },
    content: { type: "text", label: "正文", maxLength: 360 },
    align: { type: "select", label: "对齐", maxLength: 10, options: ["left", "center", "right"] },
  },
  button: {
    text: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  image_text: {
    title: { type: "string", label: "标题", maxLength: 24 },
    content: { type: "text", label: "正文", maxLength: 220 },
    buttonText: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  case_list: {
    title: { type: "string", label: "标题", maxLength: 24 },
  },
  countdown: {
    title: { type: "string", label: "标题", maxLength: 24 },
  },
  lead_form: {
    title: { type: "string", label: "标题", maxLength: 24 },
    description: { type: "text", label: "说明", maxLength: 90 },
    submitText: { type: "string", label: "提交按钮", maxLength: 8 },
  },
  phone_cta: {
    text: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  floating_phone_cta: {
    text: { type: "string", label: "按钮文案", maxLength: 8 },
  },
  footer: {
    text: { type: "string", label: "底部文字", maxLength: 60 },
  },
};

const PAGE_SETTINGS_AI_FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  title: { type: "string", label: "页面标题", maxLength: 120 },
  slug: { type: "string", label: "页面路径", maxLength: 80 },
  description: { type: "text", label: "页面描述", maxLength: 500 },
  display_scene: {
    type: "select",
    label: "展示场景",
    maxLength: 20,
    options: ["all", "home", "customer_home", "project_detail", "marketing_list"],
  },
};

const SYSTEM_PROMPT = `你是家装公司 H5 营销活动页配置助手。
你只负责根据页面上下文优化当前模块的可编辑文案字段。

必须遵守：
1. 只返回 JSON，禁止输出解释、markdown 或代码块。
2. 返回格式必须是 {"patch": {"字段名": "字段值"}}。
3. 只能填写 field_schema 中列出的字段，不要新增字段。
4. 不要修改图片、电话、链接、跳转动作、项目案例列表、倒计时日期。
5. 文案要简洁、适合手机屏幕，避免夸大承诺和绝对化表达。
6. 家装业务场景优先围绕装修咨询、活动权益、设计方案、施工服务和预约转化。`;

const SETTINGS_SYSTEM_PROMPT = `你是家装公司 H5 营销活动页配置助手。
你只负责优化活动页列表配置弹窗里的基础展示信息。

必须遵守：
1. 只返回 JSON，禁止输出解释、markdown 或代码块。
2. 返回格式必须是 {"patch": {"字段名": "字段值"}}。
3. 只能填写 field_schema 中列出的字段，不要新增字段。
4. 不要修改排序、有效期、发布状态、图片或链接。
5. slug 必须是小写英文、数字、中划线组合，不能以中划线开头或结尾。
6. display_scene 只能从 field_schema.options 中选择。
7. 文案要简洁、适合小程序活动列表展示，避免夸大承诺和绝对化表达。`;

const CREATE_SYSTEM_PROMPT = `你正在为装修公司后台生成 H5 营销活动页的新建表单内容。

业务场景：
- 装修公司获客活动。
- 用户会在微信小程序 web-view 或 H5 页面中看到。
- 目标是让客户愿意留下联系方式。

生成字段：
- title：页面标题，不超过 30 个中文字符。
- description：页面描述，不超过 80 个中文字符。

写作要求：
1. 只返回 JSON，禁止输出解释、markdown 或代码块。
2. 返回格式必须是 {"title": "string", "description": "string"}。
3. 清晰、可信、偏转化。
4. 不夸大承诺，不使用“百分百”“保证”等绝对化表达。
5. 不生成价格虚假承诺。
6. 不生成链接、手机号、二维码。
7. 不生成 slug、页面模块配置或其他字段。`;

function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function requireAiEnv(names: string[], label: string) {
  const value = firstNonEmptyEnv(names);

  if (!value) {
    throw Errors.dbError(`缺少 AI 环境变量: ${label}`);
  }

  return value;
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

  return requireAiEnv(envNames, "AI_API_KEY / DEEPSEEK_API_KEY");
}

async function getAiModel(endpoint: string) {
  const explicit = await systemSettingsService.getString("AI_MODEL");
  if (explicit) {
    return explicit;
  }

  if (endpoint.includes("api.deepseek.com")) {
    return "deepseek-chat";
  }

  throw Errors.dbError("缺少 AI 环境变量: AI_MODEL / DEEPSEEK_MODEL");
}

async function getAiRequestTimeoutMs() {
  const parsed = await systemSettingsService.getNumber("AI_REQUEST_TIMEOUT_MS", 60000);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60000;
  }

  return parsed;
}

async function getOpenRouterHeaders(endpoint: string): Promise<Record<string, string>> {
  if (!endpoint.includes("openrouter.ai")) {
    return {};
  }

  return {
    "HTTP-Referer": await systemSettingsService.getString(
      "OPENROUTER_HTTP_REFERER",
      "https://gooes.local",
    ),
    "X-Title": await systemSettingsService.getString(
      "OPENROUTER_APP_NAME",
      "gooes-marketing-page-ai",
    ),
  };
}

async function buildHeaders(apiKey: string, endpoint: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    ...await getOpenRouterHeaders(endpoint),
  };
}

function extractContent(content: OpenAiChatResponse["choices"]) {
  const rawContent = content?.[0]?.message?.content;

  if (typeof rawContent === "string") {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => item.text || "")
      .join("")
      .trim();
  }

  return "";
}

function parseJsonObject(content: string) {
  const trimmed = content.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }

  return {};
}

function getAllowedFieldDefinitions(input: MarketingPageBlockAiFillInput) {
  const serverDefinitions = BLOCK_AI_FIELD_DEFINITIONS[input.block.type] || {};
  const allowed: Record<string, FieldDefinition> = {};

  for (const [key, serverDefinition] of Object.entries(serverDefinitions)) {
    const clientDefinition = input.field_schema[key];
    if (!clientDefinition) {
      continue;
    }

    allowed[key] = {
      ...serverDefinition,
      label: clientDefinition.label || serverDefinition.label,
      maxLength: Math.min(
        clientDefinition.maxLength || serverDefinition.maxLength,
        serverDefinition.maxLength,
      ),
      options: serverDefinition.options || clientDefinition.options,
    };
  }

  return allowed;
}

function getAllowedSettingsFieldDefinitions(input: MarketingPageSettingsAiFillInput) {
  const allowed: Record<string, FieldDefinition> = {};

  for (const [key, serverDefinition] of Object.entries(PAGE_SETTINGS_AI_FIELD_DEFINITIONS)) {
    const clientDefinition = input.field_schema[key];
    if (!clientDefinition) {
      continue;
    }

    allowed[key] = {
      ...serverDefinition,
      label: clientDefinition.label || serverDefinition.label,
      maxLength: Math.min(
        clientDefinition.maxLength || serverDefinition.maxLength,
        serverDefinition.maxLength,
      ),
      options: serverDefinition.options || clientDefinition.options,
    };
  }

  return allowed;
}

function summarizeBlock(block: MarketingPageBlockAiFillInput["block"]) {
  const props = block.props || {};
  const summary: Record<string, unknown> = {
    id: block.id,
    type: block.type,
  };

  for (const key of ["title", "kicker", "subtitle", "content", "description", "text", "buttonText", "submitText", "caption"]) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) {
      summary[key] = value.trim().slice(0, 160);
    }
  }

  return summary;
}

function summarizeConfig(input: MarketingPageBlockAiFillInput) {
  const blocks = input.config?.blocks || [];
  return {
    title: input.config?.title || input.page?.title || "",
    block_count: blocks.length,
    blocks: blocks.slice(0, 30).map((block, index) => ({
      index: index + 1,
      label: BLOCK_AI_FIELD_DEFINITIONS[block.type] ? block.type : "unknown",
      current: summarizeBlock(block),
    })),
  };
}

function buildUserPrompt(
  input: MarketingPageBlockAiFillInput,
  fieldSchema: Record<string, FieldDefinition>,
) {
  return JSON.stringify({
    page: input.page || {},
    page_context: summarizeConfig(input),
    target_block: summarizeBlock(input.block),
    field_schema: fieldSchema,
    extra_instruction: input.instruction || "",
  });
}

function buildSettingsUserPrompt(
  input: MarketingPageSettingsAiFillInput,
  fieldSchema: Record<string, FieldDefinition>,
) {
  return JSON.stringify({
    target_page: input.page || {},
    nearby_pages: (input.pages || []).slice(0, 30),
    field_schema: fieldSchema,
    extra_instruction: input.instruction || "",
  });
}

function buildCreateUserPrompt(input: MarketingPageCreateAiFillInput & {
  scope: "tenant" | "platform";
  tenantName?: string | null;
  pages?: Array<{
    title: string;
    slug: string;
    status: string;
    description: string | null;
  }>;
}) {
  return JSON.stringify({
    scope: input.scope,
    tenant_name: input.tenantName || null,
    user_instruction: input.instruction,
    nearby_pages: (input.pages || []).slice(0, 20),
    output_schema: {
      title: "页面标题，不超过 30 个中文字符",
      description: "页面描述，不超过 80 个中文字符",
    },
  });
}

async function requestAiResult(
  endpoint: string,
  apiKey: string,
  requestBody: OpenAiRequestBody,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), await getAiRequestTimeoutMs());

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: await buildHeaders(apiKey, endpoint),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => ({})) as OpenAiChatResponse;

    if (!response.ok) {
      throw Errors.dbError(result.error?.message || "大模型接口调用失败");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function truncateByChars(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function normalizePatchValue(value: unknown, definition: FieldDefinition) {
  if (value == null || typeof value === "object") {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (definition.type === "select") {
    return definition.options?.includes(text) ? text : null;
  }

  return truncateByChars(text, definition.maxLength);
}

function normalizePatch(
  raw: unknown,
  definitions: Record<string, FieldDefinition>,
  options: { normalizeSlugField?: boolean } = {},
) {
  const source = raw && typeof raw === "object" && "patch" in raw
    ? (raw as { patch?: unknown }).patch
    : raw;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  const patch: Record<string, string> = {};

  for (const [key, definition] of Object.entries(definitions)) {
    let normalized = normalizePatchValue((source as Record<string, unknown>)[key], definition);
    if (normalized && options.normalizeSlugField && key === "slug") {
      normalized = normalizeSlug(normalized);
    }
    if (normalized) {
      patch[key] = normalized;
    }
  }

  return patch;
}

function normalizeCreateResult(raw: unknown) {
  const source = raw && typeof raw === "object" && "patch" in raw
    ? (raw as { patch?: unknown }).patch
    : raw;

  const definitions: Record<string, FieldDefinition> = {
    title: { type: "string", label: "页面标题", maxLength: 30 },
    description: { type: "text", label: "页面描述", maxLength: 80 },
  };
  const patch = normalizePatch(source, definitions);

  if (!patch.title || !patch.description) {
    throw Errors.business(
      502,
      "AI 生成结果格式异常，请重新生成",
      "MARKETING_PAGE_CREATE_AI_PARSE_FAILED",
    );
  }

  return {
    title: patch.title,
    description: patch.description,
  };
}

export async function fillMarketingPageBlockWithAi(input: MarketingPageBlockAiFillInput) {
  const fieldDefinitions = getAllowedFieldDefinitions(input);
  if (Object.keys(fieldDefinitions).length === 0) {
    throw Errors.badRequest("当前模块暂无可由 AI 填写的字段");
  }

  const messages: OpenAiRequestBody["messages"] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input, fieldDefinitions) },
  ];

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;

  try {
    result = await aiGateway.chat({
      sceneCode: "marketing_page_block_fill",
      temperature: 0.4,
      messages,
      responseFormat: "json_object",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await aiGateway.chat({
      sceneCode: "marketing_page_block_fill",
      temperature: 0.4,
      messages,
    });
  }

  const content = result.content;
  if (!content) {
    throw Errors.dbError("大模型未返回有效内容");
  }

  const patch = normalizePatch(parseJsonObject(content), fieldDefinitions);
  if (Object.keys(patch).length === 0) {
    throw Errors.badRequest("AI 未返回可用的模块内容");
  }

  return {
    patch,
    fields: Object.keys(patch),
  };
}

export async function fillMarketingPageSettingsWithAi(input: MarketingPageSettingsAiFillInput) {
  const fieldDefinitions = getAllowedSettingsFieldDefinitions(input);
  if (Object.keys(fieldDefinitions).length === 0) {
    throw Errors.badRequest("当前配置暂无可由 AI 填写的字段");
  }

  const messages: OpenAiRequestBody["messages"] = [
    { role: "system", content: SETTINGS_SYSTEM_PROMPT },
    { role: "user", content: buildSettingsUserPrompt(input, fieldDefinitions) },
  ];

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;

  try {
    result = await aiGateway.chat({
      sceneCode: "marketing_page_settings_fill",
      temperature: 0.35,
      messages,
      responseFormat: "json_object",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await aiGateway.chat({
      sceneCode: "marketing_page_settings_fill",
      temperature: 0.35,
      messages,
    });
  }

  const content = result.content;
  if (!content) {
    throw Errors.dbError("大模型未返回有效内容");
  }

  const patch = normalizePatch(parseJsonObject(content), fieldDefinitions, {
    normalizeSlugField: true,
  });
  if (Object.keys(patch).length === 0) {
    throw Errors.badRequest("AI 未返回可用的配置内容");
  }

  return {
    patch,
    fields: Object.keys(patch),
  };
}

export async function fillMarketingPageCreateWithAi(input: MarketingPageCreateAiFillInput & {
  scope: "tenant" | "platform";
  tenantId?: string | null;
  tenantName?: string | null;
  pages?: Array<{
    title: string;
    slug: string;
    status: string;
    description: string | null;
  }>;
}) {
  const messages: OpenAiRequestBody["messages"] = [
    { role: "system", content: CREATE_SYSTEM_PROMPT },
    { role: "user", content: buildCreateUserPrompt(input) },
  ];

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;

  try {
    result = await aiGateway.chat({
      sceneCode: "marketing_page_create_fill",
      tenantId: input.tenantId ?? null,
      temperature: 0.45,
      messages,
      responseFormat: "json_object",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await aiGateway.chat({
      sceneCode: "marketing_page_create_fill",
      tenantId: input.tenantId ?? null,
      temperature: 0.45,
      messages,
    });
  }

  const content = result.content;
  if (!content) {
    throw Errors.business(
      502,
      "AI 生成失败，请稍后重试",
      "MARKETING_PAGE_CREATE_AI_EMPTY",
    );
  }

  return normalizeCreateResult(parseJsonObject(content));
}
