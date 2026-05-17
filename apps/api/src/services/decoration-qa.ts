import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  DecorationQaRequestInput,
  DecorationQaStreamRequestInput,
  DecorationQaSuggestionQueryInput,
} from "@/schema/ai";
import type { Tables } from "@/types/database";
import { authorizationService } from "@/services/authorization";
import { aiGateway } from "@/services/ai-gateway";
import { decorationQaSuggestionCacheRepository } from "@/repositories/decoration-qa-suggestion-cache";
import { systemSettingsService } from "@/services/system-settings";
import {
  type AiMessageRole,
  isEmployeeOperableStatus,
  isProjectLogStageCode,
  isProjectStatus,
  PROJECT_LOG_STAGE_CONFIG,
  type ProjectLogStageCode,
  ProjectStatusConfig,
} from "@gooes/domain";

type DecorationQaResult = {
  answer: string;
  suggestions: string[];
};

type DecorationQaSuggestionScene = DecorationQaSuggestionQueryInput["scene"];

type DecorationQaSuggestionResult = {
  list: string[];
  source: "cache" | "ai" | "fallback";
  cache_key: string;
  expires_at: string | null;
};

type DecorationQaStreamEvent =
  | {
    type: "start";
    conversation_id: string;
  }
  | {
    type: "delta";
    content: string;
  }
  | {
    type: "done";
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  }
  | {
    type: "error";
    message: string;
  };

type OpenAiChatResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type OpenAiChatStreamChunk = {
  id?: string;
  choices?: Array<{
    delta?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  error?: {
    message?: string;
  };
};

type OpenAiRequestBody = {
  model: string;
  temperature: number;
  messages: Array<{ role: AiMessageRole | "system"; content: string }>;
  response_format?: { type: "json_object" };
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
};

const DEFAULT_SYSTEM_PROMPT =
  `你是一个专业的家装顾问，隶属于“字节跳动固始网络科技”。
你的任务是解答用户关于装修预算、材料选择、工期安排、施工流程、家装避坑等问题。

回答要求：
1. 态度专业、热情、客观。
2. 语言简洁明了，尽量使用分点列表（1. 2. 3.）进行说明。
3. 不要夸大承诺，不要替代专业的结构安全判断。
4. 涉及承重墙拆改、复杂水电改造等高风险施工时，必须提醒用户“具体以现场专业评估为准”。
5. 每次回答结束时，可以根据当前话题，给出 1-2 个相关的延伸问题建议。`;

const JSON_OUTPUT_PROMPT = `

你必须严格以 JSON 返回，禁止输出 JSON 之外的解释文字，格式如下：
{
  "answer": "回答正文",
  "suggestions": ["追问1", "追问2"]
}

要求：
1. answer 必须是字符串。
2. suggestions 必须是字符串数组，没有追问时返回空数组 []。
3. 不要使用 markdown 代码块。
4. 不要输出多余前缀、后缀或说明。`;

const STREAM_OUTPUT_PROMPT = `

你必须直接输出自然语言答案正文，不要输出 JSON，不要输出 markdown 代码块，不要输出多余前缀。
回答结束时不要再补“如需我继续”等收尾套话。`;

const SUGGESTION_SYSTEM_PROMPT =
  `你是装修公司小程序里的装修知识问答推荐问题生成器。
请生成 4 个用户可能会点击的问题。
要求：
1. 每个问题 8 到 22 个中文字符左右。
2. 必须是装修相关问题。
3. 表达具体，不要空泛。
4. 不要输出答案。
5. 不要输出编号。
6. 不要包含 markdown。
7. 不要承诺价格、工期或法律责任。
8. 返回 JSON 数组字符串。`;

const FALLBACK_VISITOR = [
  "装修预算怎么控制？",
  "水电改造要注意什么？",
  "全包和半包怎么选？",
  "装修工期一般多久？",
  "瓷砖验收看哪些细节？",
  "旧房翻新先做什么？",
  "环保材料怎么选择？",
  "装修合同重点看哪里？",
];

const FALLBACK_CUSTOMER = [
  "当前阶段要注意什么？",
  "验收时重点看哪些地方？",
  "施工延期该怎么处理？",
  "增项费用怎么确认？",
  "材料进场要核对什么？",
  "水电验收怎么判断合格？",
];

const FALLBACK_EMPLOYEE = [
  "客户问预算怎么解释？",
  "水电工艺如何说明？",
  "延期原因怎么沟通？",
  "验收标准怎么讲清楚？",
  "材料差异怎么解释？",
  "增项确认怎么提醒？",
];

type CustomerContextRow = Pick<
  Tables<"customers">,
  "id" | "name" | "user_id" | "tenant_id"
>;

type ProjectQaProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  address: string | null;
  start_date: string | null;
  style_tags: unknown;
  property: {
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
  } | {
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
  }[] | null;
  designer: {
    name: string | null;
  } | {
    name: string | null;
  }[] | null;
  supervisor: {
    name: string | null;
  } | {
    name: string | null;
  }[] | null;
};

type ProjectQaLogRow = {
  stage_code: string | null;
  node_name: string | null;
  content: string | null;
  created_at: string | null;
};

type CustomerProjectQaContext = {
  customer_id: string;
  customer_name: string | null;
  tenant_id: string | null;
  project_id: string;
  project_name: string | null;
  status: string | null;
  status_label: string | null;
  address: string | null;
  start_date: string | null;
  style_tags: string[];
  property: {
    community: string | null;
    building_info: string | null;
    layout: string | null;
    area: number | null;
  } | null;
  designer_name: string | null;
  supervisor_name: string | null;
  recent_logs: Array<{
    stage_code: ProjectLogStageCode | null;
    stage_label: string | null;
    node_name: string | null;
    content: string | null;
    created_at: string | null;
  }>;
};

type ProjectQaProjectRowWithTenant = ProjectQaProjectRow & {
  tenant_id: string | null;
};

type DecorationQaUsageSource =
  | "customer_miniprogram"
  | "employee_miniprogram"
  | "visitor"
  | "admin";

type DecorationQaUsageContext = {
  authUserId?: string | null;
  tenantId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  projectId?: string | null;
  source: DecorationQaUsageSource;
  billable: boolean;
};

type DecorationQaAuthInput = {
  authUserId?: string | null;
  tenantId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  roles?: string[];
};

const PROJECT_STAGE_REMINDER_PROMPTS: Partial<
  Record<ProjectLogStageCode, string[]>
> = {
  measure: [
    "提醒客户确认量房尺寸、功能需求和预算边界，避免后续频繁改方案。",
    "提醒客户尽快确认平面布局和核心设备需求，减少设计返工。",
  ],
  demolition: [
    "提醒客户关注拆改范围是否与方案一致，承重墙和高风险结构改动必须以现场专业评估为准。",
    "提醒客户提前确认垃圾清运、邻里沟通和施工时间安排。",
  ],
  plumbing_electrical: [
    "提醒客户尽快确认插座、开关、灯位和水路点位，后期改动成本会明显上升。",
    "提醒客户保留好水电施工照片和验收记录，方便后续维护。",
  ],
  tiling: [
    "提醒客户确认瓷砖铺贴方向、对缝方式、地漏坡度和门槛石细节。",
    "提醒客户关注空鼓、阴阳角和排水顺畅情况，必要时安排现场复核。",
  ],
  woodwork: [
    "提醒客户确认柜体尺寸、收口方式、五金和插座避让细节。",
    "提醒客户尽量在封板前完成隐蔽位置复核，避免后续拆改。",
  ],
  painting: [
    "提醒客户确认色号、墙面找平效果和成品保护，避免后续补漆色差。",
    "提醒客户关注通风时间和干燥周期，不要急于安排后续安装。",
  ],
  installation: [
    "提醒客户确认灯具、洁具、开关面板和定制成品的到场顺序，避免安装冲突。",
    "提醒客户在安装阶段重点检查成品保护和设备调试情况。",
  ],
  completion: [
    "提醒客户整理竣工验收清单，逐项确认功能、观感和遗留问题。",
    "提醒客户保留水电图、设备说明书和售后联系方式，方便后续使用维护。",
  ],
};

const PROJECT_STATUS_REMINDER_PROMPTS: Partial<Record<string, string[]>> = {
  designing: [
    "提醒客户尽快确认平面方案、主材方向和预算边界，减少进入施工后的变更成本。",
  ],
  constructing: [
    "提醒客户关注当前施工节点的验收和材料到场衔接，避免因为确认不及时影响工期。",
  ],
  acceptance: [
    "提醒客户按验收清单逐项确认，并把遗留问题记录清楚后再安排收尾。",
  ],
  after_sale: [
    "提醒客户把具体问题、发生位置和时间记录清楚，方便售后快速定位处理。",
  ],
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

function requireAiEnv(names: string[], label: string) {
  const value = firstNonEmptyEnv(names);

  if (!value) {
    throw Errors.dbError(`缺少 AI 环境变量: ${label}`);
  }

  return value;
}

async function getAiEndpoint() {
  const hasDeepSeekApiKey = Boolean(
    await systemSettingsService.getSecretString("DEEPSEEK_API_KEY"),
  );
  return (await systemSettingsService.getString("AI_CHAT_COMPLETIONS_URL")) ||
    (hasDeepSeekApiKey
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

function getAiProviderCode(endpoint: string) {
  if (endpoint.includes("api.deepseek.com")) {
    return "deepseek";
  }

  if (endpoint.includes("api.openai.com")) {
    return "openai";
  }

  if (endpoint.includes("openrouter.ai")) {
    return "openrouter";
  }

  return "custom";
}

async function getAiRequestTimeoutMs() {
  const parsed = await systemSettingsService.getNumber(
    "AI_REQUEST_TIMEOUT_MS",
    60000,
  );

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60000;
  }

  return parsed;
}

async function getBaseSystemPrompt() {
  const customPrompt = await systemSettingsService.getString(
    "DECORATION_QA_SYSTEM_PROMPT",
  );
  return customPrompt || DEFAULT_SYSTEM_PROMPT;
}

async function getSystemPrompt() {
  return `${await getBaseSystemPrompt()}${JSON_OUTPUT_PROMPT}`;
}

async function getStreamingSystemPrompt() {
  return `${await getBaseSystemPrompt()}${STREAM_OUTPUT_PROMPT}`;
}

async function getOpenRouterHeaders(
  endpoint: string,
): Promise<Record<string, string>> {
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
      "gooes-decoration-qa",
    ),
  };
}

function normalizeSuggestions(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function getFallbackSuggestionQuestions(scene: DecorationQaSuggestionScene) {
  if (scene === "customer") {
    return FALLBACK_CUSTOMER.slice(0, 4);
  }

  if (scene === "employee") {
    return FALLBACK_EMPLOYEE.slice(0, 4);
  }

  return FALLBACK_VISITOR.slice(0, 4);
}

function stripSuggestionPrefix(value: string) {
  return value
    .replace(/^\s*(?:[-*•]+|\d+[.、)]|[一二三四五六七八九十]+[、.)])\s*/u, "")
    .trim();
}

function getSuggestionLength(value: string) {
  return Array.from(value).length;
}

function tryParseSuggestionJson(rawContent: string) {
  const trimmed = rawContent.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)) as unknown;
    } catch {
      return [];
    }
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return [];
  }
}

function normalizeSuggestionQuestions(
  input: unknown,
  scene: DecorationQaSuggestionScene,
) {
  const rawList = typeof input === "string"
    ? tryParseSuggestionJson(input)
    : input;
  const list = Array.isArray(rawList)
    ? rawList
    : rawList && typeof rawList === "object" && "list" in rawList
    ? (rawList as { list?: unknown }).list
    : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item !== "string") {
        continue;
      }

      const question = stripSuggestionPrefix(item);
      if (
        !question ||
        seen.has(question) ||
        getSuggestionLength(question) > 28
      ) {
        continue;
      }

      seen.add(question);
      normalized.push(question);
      if (normalized.length >= 4) {
        break;
      }
    }
  }

  for (const fallback of getFallbackSuggestionQuestions(scene)) {
    if (normalized.length >= 4) {
      break;
    }

    if (!seen.has(fallback)) {
      seen.add(fallback);
      normalized.push(fallback);
    }
  }

  return normalized.slice(0, 4);
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

function extractDeltaContent(content: OpenAiChatStreamChunk["choices"]) {
  const rawContent = content?.[0]?.delta?.content;

  if (typeof rawContent === "string") {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => item.text || "")
      .join("");
  }

  return "";
}

function parseQaResult(rawContent: string): DecorationQaResult {
  const trimmed = rawContent.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    return {
      answer: trimmed || "暂时无法生成回答，请稍后再试。",
      suggestions: [],
    };
  }

  const jsonText = trimmed.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonText) as {
      answer?: unknown;
      suggestions?: unknown;
    };

    return {
      answer: typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim()
        : "暂时无法生成回答，请稍后再试。",
      suggestions: normalizeSuggestions(parsed.suggestions),
    };
  } catch {
    return {
      answer: trimmed || "暂时无法生成回答，请稍后再试。",
      suggestions: [],
    };
  }
}

async function buildHeaders(
  apiKey: string,
  endpoint: string,
): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...await getOpenRouterHeaders(endpoint),
  };
}

function buildMessages(
  question: string,
  history: DecorationQaRequestInput["history"],
  systemPrompt: string,
  extraSystemMessages: string[] = [],
): OpenAiRequestBody["messages"] {
  return [
    { role: "system", content: systemPrompt },
    ...extraSystemMessages.map((content) => ({
      role: "system" as const,
      content,
    })),
    ...history,
    { role: "user", content: question },
  ];
}

function normalizeTotalTokens(input: {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}) {
  if (
    typeof input.totalTokens === "number" && Number.isFinite(input.totalTokens)
  ) {
    return Math.max(0, Math.floor(input.totalTokens));
  }

  const promptTokens =
    typeof input.promptTokens === "number" &&
      Number.isFinite(input.promptTokens)
      ? Math.max(0, Math.floor(input.promptTokens))
      : null;
  const completionTokens = typeof input.completionTokens === "number" &&
      Number.isFinite(input.completionTokens)
    ? Math.max(0, Math.floor(input.completionTokens))
    : null;

  if (promptTokens == null && completionTokens == null) {
    return null;
  }

  return (promptTokens || 0) + (completionTokens || 0);
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

async function getCustomerContextByAuthUserId(authUserId: string) {
  const customer = await findCustomerContextByAuthUserId(authUserId);

  if (!customer) {
    throw Errors.forbidden();
  }

  return customer;
}

async function findCustomerContextByAuthUserId(authUserId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select("id, name, user_id, tenant_id")
    .eq("user_id", authUserId)
    .limit(2);

  if (error) {
    throw Errors.dbError("查询客户身份失败", error);
  }

  const list = (data || []) as CustomerContextRow[];
  if (list.length > 1) {
    throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
  }

  return list[0] ?? null;
}

function getSourceFromAuth(
  input: DecorationQaAuthInput,
): DecorationQaUsageSource {
  if (input.roles?.includes("customer") || input.customerId) {
    return "customer_miniprogram";
  }

  if (input.roles?.includes("employee") || input.employeeId) {
    return "employee_miniprogram";
  }

  return "visitor";
}

async function inferDecorationQaUsageContextFromAuth(
  input: DecorationQaAuthInput & {
    projectId?: string | null;
  },
): Promise<DecorationQaUsageContext | null> {
  if (!input.authUserId) {
    return null;
  }

  const customer = await findCustomerContextByAuthUserId(input.authUserId);
  if (customer) {
    if (input.projectId) {
      const context = await buildCustomerProjectQaContext(
        input.authUserId,
        input.projectId,
      );
      if (!context.tenant_id) {
        return null;
      }

      return {
        authUserId: input.authUserId,
        tenantId: context.tenant_id,
        customerId: context.customer_id,
        employeeId: null,
        projectId: context.project_id,
        source: "customer_miniprogram",
        billable: true,
      };
    }

    if (customer.tenant_id) {
      return {
        authUserId: input.authUserId,
        tenantId: customer.tenant_id,
        customerId: customer.id,
        employeeId: null,
        projectId: null,
        source: "customer_miniprogram",
        billable: true,
      };
    }
  }

  const employeeContext = await authorizationService.getAuthContextByAuthUserId(
    input.authUserId,
  );
  if (
    employeeContext.employeeId &&
    employeeContext.tenantId &&
    isEmployeeOperableStatus(employeeContext.employeeStatus)
  ) {
    return {
      authUserId: input.authUserId,
      tenantId: employeeContext.tenantId,
      customerId: null,
      employeeId: employeeContext.employeeId,
      projectId: input.projectId ?? null,
      source: "employee_miniprogram",
      billable: true,
    };
  }

  return null;
}

async function resolveDecorationQaUsageContext(
  input: DecorationQaAuthInput & {
    role?: "visitor" | "customer" | "employee";
    projectId?: string | null;
  },
): Promise<DecorationQaUsageContext> {
  const source = input.role === "customer"
    ? "customer_miniprogram"
    : input.role === "employee"
    ? "employee_miniprogram"
    : getSourceFromAuth(input);

  if (source === "visitor") {
    const inferredContext = await inferDecorationQaUsageContextFromAuth(input);
    if (inferredContext) {
      return inferredContext;
    }

    return {
      authUserId: input.authUserId,
      tenantId: null,
      customerId: null,
      employeeId: null,
      projectId: input.projectId ?? null,
      source,
      billable: false,
    };
  }

  if (source === "customer_miniprogram") {
    if (!input.authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    if (input.projectId) {
      const context = await buildCustomerProjectQaContext(
        input.authUserId,
        input.projectId,
      );
      if (!context.tenant_id) {
        throw Errors.business(
          403,
          "当前项目缺少装修公司上下文",
          "AI_TENANT_CONTEXT_MISSING",
        );
      }

      return {
        authUserId: input.authUserId,
        tenantId: context.tenant_id,
        customerId: context.customer_id,
        employeeId: null,
        projectId: context.project_id,
        source,
        billable: true,
      };
    }

    if (input.tenantId) {
      return {
        authUserId: input.authUserId,
        tenantId: input.tenantId,
        customerId: input.customerId ?? null,
        employeeId: null,
        projectId: null,
        source,
        billable: true,
      };
    }

    const customer = await getCustomerContextByAuthUserId(input.authUserId);
    if (!customer.tenant_id) {
      throw Errors.business(
        403,
        "当前客户缺少装修公司上下文",
        "AI_TENANT_CONTEXT_MISSING",
      );
    }

    return {
      authUserId: input.authUserId,
      tenantId: customer.tenant_id,
      customerId: customer.id,
      employeeId: null,
      projectId: null,
      source,
      billable: true,
    };
  }

  if (!input.tenantId) {
    throw Errors.business(
      403,
      "当前员工缺少装修公司上下文",
      "AI_TENANT_CONTEXT_MISSING",
    );
  }

  return {
    authUserId: input.authUserId,
    tenantId: input.tenantId,
    customerId: null,
    employeeId: input.employeeId ?? null,
    projectId: input.projectId ?? null,
    source,
    billable: true,
  };
}

async function buildCustomerProjectQaContext(
  authUserId: string,
  projectId: string,
): Promise<CustomerProjectQaContext> {
  const customer = await getCustomerContextByAuthUserId(authUserId);
  const { data: projectData, error: projectError } = await SupabaseDB
    .getAdminClient()
    .from("projects")
    .select(`
      id,
      tenant_id,
      name,
      status,
      address,
      start_date,
      style_tags,
      property:properties!projects_property_id_fkey(
        community,
        building_info,
        layout,
        area
      ),
      designer:employees!projects_designer_id_fkey(
        name
      ),
      supervisor:employees!projects_supervisor_id_fkey(
        name
      )
    `)
    .eq("id", projectId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (projectError) {
    throw Errors.dbError("查询客户项目上下文失败", projectError);
  }

  if (!projectData) {
    throw Errors.forbidden();
  }

  const { data: logsData, error: logsError } = await SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("stage_code, node_name, content, created_at")
    .eq("project_id", projectId)
    .eq(
      "tenant_id",
      (projectData as unknown as ProjectQaProjectRowWithTenant).tenant_id,
    )
    .order("created_at", { ascending: false })
    .limit(5);

  if (logsError) {
    throw Errors.dbError("查询客户项目日志上下文失败", logsError);
  }

  const project = projectData as unknown as ProjectQaProjectRowWithTenant;
  const property = normalizeRelation(project.property, {
    community: null,
    building_info: null,
    layout: null,
    area: null,
  });
  const designer = normalizeRelation(project.designer, {
    name: null,
  });
  const supervisor = normalizeRelation(project.supervisor, {
    name: null,
  });
  const status = isProjectStatus(project.status) ? project.status : null;

  return {
    customer_id: customer.id,
    customer_name: customer.name,
    tenant_id: project.tenant_id,
    project_id: project.id,
    project_name: project.name,
    status,
    status_label: status ? ProjectStatusConfig[status].label : null,
    address: project.address,
    start_date: project.start_date,
    style_tags: normalizeStringArray(project.style_tags),
    property:
      property.community || property.building_info || property.layout ||
        property.area
        ? {
          community: typeof property.community === "string"
            ? property.community
            : null,
          building_info: typeof property.building_info === "string"
            ? property.building_info
            : null,
          layout: typeof property.layout === "string" ? property.layout : null,
          area: typeof property.area === "number" ? property.area : null,
        }
        : null,
    designer_name: typeof designer.name === "string" ? designer.name : null,
    supervisor_name: typeof supervisor.name === "string"
      ? supervisor.name
      : null,
    recent_logs: ((logsData || []) as ProjectQaLogRow[]).map((item) => {
      const stageCode = isProjectLogStageCode(item.stage_code)
        ? item.stage_code
        : null;

      return {
        stage_code: stageCode,
        stage_label: stageCode
          ? PROJECT_LOG_STAGE_CONFIG[stageCode].label
          : null,
        node_name: item.node_name,
        content: item.content,
        created_at: item.created_at,
      };
    }),
  };
}

function formatCustomerProjectQaContext(context: CustomerProjectQaContext) {
  const latestLogWithStage = context.recent_logs.find((item) =>
    item.stage_code
  );
  const reminderPrompts = latestLogWithStage?.stage_code
    ? (PROJECT_STAGE_REMINDER_PROMPTS[latestLogWithStage.stage_code] || [])
    : (context.status
      ? (PROJECT_STATUS_REMINDER_PROMPTS[context.status] || [])
      : []);
  const lines: string[] = [
    "以下是当前客户项目上下文，仅可基于这些已同步资料回答项目相关问题。",
    "如果上下文不足，请明确说明“根据当前已同步的项目资料，暂时无法确认更多细节”。",
    "不要虚构施工进度、团队成员、时间计划或未发生的项目节点。",
    "如果用户在询问当前项目相关问题，除直接回答外，请尽量结合当前施工进度或项目状态，自然补充 1-3 条温馨提醒事项。",
    "温馨提醒必须贴近当前阶段，不能脱离当前项目上下文泛泛而谈。",
    "",
    "当前客户项目上下文：",
    `- 客户名称：${context.customer_name || "未同步"}`,
    `- 项目名称：${context.project_name || "未同步"}`,
    `- 项目状态：${context.status_label || context.status || "未同步"}`,
    `- 项目地址：${context.address || "未同步"}`,
    `- 开工日期：${context.start_date || "未同步"}`,
    `- 风格标签：${
      context.style_tags.length ? context.style_tags.join("、") : "未同步"
    }`,
    `- 主案设计：${context.designer_name || "未同步"}`,
    `- 施工管理：${context.supervisor_name || "未同步"}`,
  ];

  if (context.property) {
    lines.push(
      `- 房产信息：${
        [
          context.property.community,
          context.property.building_info,
          context.property.layout,
          context.property.area ? `${context.property.area}㎡` : null,
        ].filter(Boolean).join("，") || "未同步"
      }`,
    );
  } else {
    lines.push("- 房产信息：未同步");
  }

  if (context.recent_logs.length > 0) {
    lines.push("- 最近施工日志：");
    context.recent_logs.forEach((item, index) => {
      const parts = [
        item.created_at ? item.created_at.slice(0, 10) : null,
        item.stage_label || item.stage_code,
        item.node_name,
        item.content,
      ].filter(Boolean);

      lines.push(`  ${index + 1}. ${parts.join(" - ")}`);
    });
  } else {
    lines.push("- 最近施工日志：当前没有已同步的施工日志");
  }

  if (reminderPrompts.length > 0) {
    lines.push("- 当前阶段温馨提醒参考：");
    reminderPrompts.forEach((item, index) => {
      lines.push(`  ${index + 1}. ${item}`);
    });
  } else {
    lines.push(
      "- 当前阶段温馨提醒参考：当前未同步到足够阶段信息，请谨慎提醒并说明依据有限",
    );
  }

  return lines.join("\n");
}

function formatCustomerProjectSuggestionContext(
  context: CustomerProjectQaContext,
) {
  const latestLog = context.recent_logs[0];
  const parts = [
    context.status_label || context.status
      ? `项目阶段：${context.status_label || context.status}`
      : null,
    context.property?.area ? `房屋面积：${context.property.area}㎡` : null,
    context.property?.layout ? `户型：${context.property.layout}` : null,
    context.style_tags.length ? `风格：${context.style_tags.join("、")}` : null,
    latestLog
      ? `最近施工节点：${
        [
          latestLog.stage_label,
          latestLog.node_name,
        ].filter(Boolean).join(" - ") || "未同步"
      }`
      : "最近施工节点：未同步",
    context.status === "acceptance" ||
      latestLog?.stage_code === "completion"
      ? "当前可能临近验收"
      : null,
  ].filter(Boolean);

  return parts.length
    ? parts.join("\n")
    : "当前项目摘要：暂未同步足够项目资料。";
}

function getSuggestionDateKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function buildSuggestionCacheKey(input: {
  scene: DecorationQaSuggestionScene;
  projectId: string | null;
  now: Date;
}) {
  const dateKey = getSuggestionDateKey(input.now);

  if (input.scene === "customer" && input.projectId) {
    return `customer:${input.projectId}:${dateKey}`;
  }

  return `${input.scene}:${dateKey}`;
}

function getSuggestionExpiresAt(input: {
  scene: DecorationQaSuggestionScene;
  projectId: string | null;
  now: Date;
}) {
  if (input.scene === "customer" && input.projectId) {
    return new Date(input.now.getTime() + 6 * 60 * 60 * 1000);
  }

  const expiresAt = new Date(input.now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
  expiresAt.setUTCHours(0, 0, 0, 0);
  return expiresAt;
}

async function buildSuggestionScenePrompt(input: {
  scene: DecorationQaSuggestionScene;
  projectId: string | null;
  authUserId?: string;
}) {
  if (input.scene === "visitor") {
    return "用户是普通访客，还没有明确项目。问题应覆盖预算、流程、材料、工期、验收等通用主题。";
  }

  if (!input.authUserId) {
    throw Errors.unauthorized("缺少登录凭证");
  }

  if (input.scene === "employee") {
    const authContext = await authorizationService.getRequiredAuthContext(
      input.authUserId,
    );
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    return "用户是装修公司员工。问题可以偏向客户沟通、施工解释、材料工艺说明。";
  }

  if (input.projectId) {
    const context = await buildCustomerProjectQaContext(
      input.authUserId,
      input.projectId,
    );

    return [
      "用户是装修客户。请优先结合当前项目阶段生成问题，问题应该站在客户视角，便于客户点击咨询。",
      "当前项目摘要：",
      formatCustomerProjectSuggestionContext(context),
    ].join("\n");
  }

  await getCustomerContextByAuthUserId(input.authUserId);
  return "用户是装修客户，但当前没有指定项目。请生成客户视角的通用装修问题，重点覆盖流程、验收、费用确认和工期沟通。";
}

async function generateSuggestionQuestionsByAi(
  scenePrompt: string,
  usageContext: DecorationQaUsageContext,
) {
  const result = await aiGateway.chat({
    sceneCode: "decoration_qa_title",
    tenantId: usageContext.tenantId,
    source: usageContext.source,
    billable: usageContext.billable,
    metadata: {
      source: usageContext.source,
      auth_user_id: usageContext.authUserId ?? null,
      customer_id: usageContext.customerId ?? null,
      employee_id: usageContext.employeeId ?? null,
      project_id: usageContext.projectId ?? null,
    },
    temperature: 0.8,
    messages: [
      { role: "system", content: SUGGESTION_SYSTEM_PROMPT },
      { role: "user", content: scenePrompt },
    ],
  });
  const content = result.content;

  if (!content) {
    throw Errors.dbError("大模型未返回有效推荐问题");
  }

  return content;
}

async function tryGetCachedSuggestion(cacheKey: string, now: Date) {
  try {
    return await decorationQaSuggestionCacheRepository.findValid(cacheKey, now);
  } catch {
    return null;
  }
}

async function trySaveSuggestionCache(input: {
  cacheKey: string;
  scene: DecorationQaSuggestionScene;
  projectId: string | null;
  questions: string[];
  source: "ai" | "fallback";
  expiresAt: Date;
}) {
  try {
    await decorationQaSuggestionCacheRepository.upsert({
      cache_key: input.cacheKey,
      scene: input.scene,
      project_id: input.projectId,
      questions: input.questions,
      source: input.source,
      expires_at: input.expiresAt.toISOString(),
    });
  } catch {
    // Cache failures must not block the question page.
  }
}

export async function getDecorationQaSuggestions(input: {
  query: DecorationQaSuggestionQueryInput;
  authUserId?: string;
  tenantId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  roles?: string[];
}): Promise<DecorationQaSuggestionResult> {
  const now = new Date();
  const scene = input.query.scene;
  const projectId = scene === "customer"
    ? input.query.project_id ?? null
    : null;
  const cacheKey = buildSuggestionCacheKey({ scene, projectId, now });
  const expiresAt = getSuggestionExpiresAt({ scene, projectId, now });
  const scenePrompt = await buildSuggestionScenePrompt({
    scene,
    projectId,
    authUserId: input.authUserId,
  });

  if (!input.query.refresh) {
    const cached = await tryGetCachedSuggestion(cacheKey, now);
    if (cached) {
      return {
        list: normalizeSuggestionQuestions(cached.questions, scene),
        source: "cache",
        cache_key: cacheKey,
        expires_at: cached.expires_at,
      };
    }
  }

  const usageContext = await resolveDecorationQaUsageContext({
    authUserId: input.authUserId,
    tenantId: input.tenantId,
    customerId: input.customerId,
    employeeId: input.employeeId,
    roles: input.roles,
    role: scene,
    projectId,
  });

  try {
    const aiQuestions = normalizeSuggestionQuestions(
      await generateSuggestionQuestionsByAi(scenePrompt, usageContext),
      scene,
    );
    await trySaveSuggestionCache({
      cacheKey,
      scene,
      projectId,
      questions: aiQuestions,
      source: "ai",
      expiresAt,
    });

    return {
      list: aiQuestions,
      source: "ai",
      cache_key: cacheKey,
      expires_at: expiresAt.toISOString(),
    };
  } catch {
    const fallbackQuestions = getFallbackSuggestionQuestions(scene);
    await trySaveSuggestionCache({
      cacheKey,
      scene,
      projectId,
      questions: fallbackQuestions,
      source: "fallback",
      expiresAt,
    });

    return {
      list: fallbackQuestions,
      source: "fallback",
      cache_key: cacheKey,
      expires_at: expiresAt.toISOString(),
    };
  }
}

export async function resolveDecorationQaStreamSystemMessages(
  input: DecorationQaStreamRequestInput,
  authUserId?: string,
) {
  if (input.context?.role !== "customer") {
    return [] as string[];
  }

  const projectId = input.context.project_id?.trim();
  if (!projectId) {
    return [] as string[];
  }

  if (!authUserId) {
    throw Errors.unauthorized("缺少登录凭证");
  }

  const context = await buildCustomerProjectQaContext(authUserId, projectId);
  return [formatCustomerProjectQaContext(context)];
}

async function requestQaResult(
  endpoint: string,
  apiKey: string,
  requestBody: OpenAiRequestBody,
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    await getAiRequestTimeoutMs(),
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: await buildHeaders(apiKey, endpoint),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const result = await response.json() as OpenAiChatResponse;

    if (!response.ok) {
      throw Errors.dbError(result.error?.message || "大模型接口调用失败");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function createStreamRequestBody(
  input: DecorationQaStreamRequestInput,
  model: string,
  temperature: number,
  extraSystemMessages: string[] = [],
): Promise<OpenAiRequestBody> {
  return {
    model,
    temperature,
    messages: buildMessages(
      input.question,
      [],
      await getStreamingSystemPrompt(),
      extraSystemMessages,
    ),
    stream: true,
    stream_options: {
      include_usage: true,
    },
  };
}

async function requestQaStream(
  endpoint: string,
  apiKey: string,
  requestBody: OpenAiRequestBody,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: await buildHeaders(apiKey, endpoint),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const result = await response.json() as OpenAiChatResponse;
      throw Errors.dbError(result.error?.message || "大模型流式调用失败");
    }

    if (!response.body) {
      throw Errors.dbError("大模型未返回可读取的流");
    }

    return {
      response,
      body: response.body,
      controller,
      clearTimeout: () => clearTimeout(timeout),
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function toNdjson(event: DecorationQaStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

function parseSseEvent(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }

  return trimmed.slice(5).trim();
}

export async function askDecorationQa(
  input: DecorationQaRequestInput,
  options?: DecorationQaAuthInput,
): Promise<DecorationQaResult> {
  const messages = buildMessages(
    input.question,
    input.history,
    await getSystemPrompt(),
  );
  const usageContext = await resolveDecorationQaUsageContext({
    authUserId: options?.authUserId,
    tenantId: options?.tenantId,
    customerId: options?.customerId,
    employeeId: options?.employeeId,
    roles: options?.roles,
  });

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;

  try {
    result = await aiGateway.chat({
      sceneCode: "decoration_qa",
      tenantId: usageContext.tenantId,
      source: usageContext.source,
      billable: usageContext.billable,
      metadata: {
        source: usageContext.source,
        auth_user_id: usageContext.authUserId ?? null,
        customer_id: usageContext.customerId ?? null,
        employee_id: usageContext.employeeId ?? null,
        project_id: usageContext.projectId ?? null,
      },
      temperature: 0.7,
      messages,
      responseFormat: "json_object",
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await aiGateway.chat({
      sceneCode: "decoration_qa",
      tenantId: usageContext.tenantId,
      source: usageContext.source,
      billable: usageContext.billable,
      metadata: {
        source: usageContext.source,
        auth_user_id: usageContext.authUserId ?? null,
        customer_id: usageContext.customerId ?? null,
        employee_id: usageContext.employeeId ?? null,
        project_id: usageContext.projectId ?? null,
      },
      temperature: 0.7,
      messages,
    });
  }

  const content = result.content;

  if (!content) {
    throw Errors.dbError("大模型未返回有效内容");
  }

  return parseQaResult(content);
}

export async function streamDecorationQa(
  input: DecorationQaStreamRequestInput,
  onEvent: (event: DecorationQaStreamEvent) => Promise<void> | void,
  options?: {
    authUserId?: string;
    tenantId?: string | null;
    customerId?: string | null;
    employeeId?: string | null;
    roles?: string[];
    extraSystemMessages?: string[];
    signal?: AbortSignal;
  },
) {
  const routeConfig = await aiGateway.resolveChatConfig({
    sceneCode: "decoration_qa",
    temperature: 0.7,
  });
  const endpoint = routeConfig.endpoint;
  const apiKey = routeConfig.apiKey;
  const model = routeConfig.modelName;
  const providerCode = routeConfig.providerCode;
  const conversationId = input.conversation_id?.trim() || `qa_${randomUUID()}`;
  const projectId = input.context?.project_id?.trim() || null;
  const usageContext = await resolveDecorationQaUsageContext({
    authUserId: options?.authUserId,
    tenantId: options?.tenantId,
    customerId: options?.customerId,
    employeeId: options?.employeeId,
    roles: options?.roles,
    role: input.context?.role,
    projectId,
  });
  const extraSystemMessages = options?.extraSystemMessages ||
    await resolveDecorationQaStreamSystemMessages(input, options?.authUserId);
  const startedAt = Date.now();

  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let totalTokens: number | undefined;
  let cachedInputTokens: number | undefined;
  let reasoningTokens: number | undefined;
  let requestId: string | null = null;
  let streamRequest: Awaited<ReturnType<typeof requestQaStream>> | null = null;
  let reader: {
    read: () => Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock: () => void;
  } | null = null;

  try {
    streamRequest = await requestQaStream(
      endpoint,
      apiKey,
      await createStreamRequestBody(
        input,
        model,
        routeConfig.temperature,
        extraSystemMessages,
      ),
      routeConfig.timeoutMs,
      options?.signal,
    );
    reader = streamRequest.body.getReader();

    await onEvent({
      type: "start",
      conversation_id: conversationId,
    });

    while (true) {
      if (!reader) {
        throw Errors.dbError("大模型流读取器未初始化");
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const data = parseSseEvent(rawLine);
        if (!data) {
          continue;
        }

        if (data === "[DONE]") {
          continue;
        }

        let chunk: OpenAiChatStreamChunk;
        try {
          chunk = JSON.parse(data) as OpenAiChatStreamChunk;
        } catch {
          continue;
        }

        if (chunk.error?.message) {
          throw Errors.dbError(chunk.error.message);
        }

        requestId = chunk.id || requestId;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
          totalTokens = chunk.usage.total_tokens;
          cachedInputTokens = chunk.usage.prompt_tokens_details?.cached_tokens;
          reasoningTokens = chunk.usage.completion_tokens_details
            ?.reasoning_tokens;
        }

        const delta = extractDeltaContent(chunk.choices);
        if (delta) {
          await onEvent({
            type: "delta",
            content: delta,
          });
        }
      }
    }

    const trailingData = parseSseEvent(buffer);
    if (trailingData && trailingData !== "[DONE]") {
      try {
        const chunk = JSON.parse(trailingData) as OpenAiChatStreamChunk;
        requestId = chunk.id || requestId;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
          totalTokens = chunk.usage.total_tokens;
          cachedInputTokens = chunk.usage.prompt_tokens_details?.cached_tokens;
          reasoningTokens = chunk.usage.completion_tokens_details
            ?.reasoning_tokens;
        }

        const delta = extractDeltaContent(chunk.choices);
        if (delta) {
          await onEvent({
            type: "delta",
            content: delta,
          });
        }
      } catch {
        // Ignore trailing partial chunks.
      }
    }

    await onEvent({
      type: "done",
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    });
    await aiGateway.logCall({
      tenantId: usageContext.tenantId,
      sceneCode: "decoration_qa",
      providerCode,
      modelCode: routeConfig.modelCode,
      modelName: model,
      status: "success",
      requestId,
      durationMs: Date.now() - startedAt,
      promptTokens: inputTokens ?? null,
      completionTokens: outputTokens ?? null,
      totalTokens: normalizeTotalTokens({
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens,
      }),
      cachedInputTokens: cachedInputTokens ?? null,
      reasoningTokens: reasoningTokens ?? null,
      rawUsage: {
        prompt_tokens: inputTokens ?? null,
        completion_tokens: outputTokens ?? null,
        total_tokens: totalTokens ?? null,
        prompt_tokens_details: {
          cached_tokens: cachedInputTokens ?? null,
        },
        completion_tokens_details: {
          reasoning_tokens: reasoningTokens ?? null,
        },
      },
      source: usageContext.source,
      billable: usageContext.billable,
      metadata: {
        source: usageContext.source,
        auth_user_id: usageContext.authUserId ?? null,
        customer_id: usageContext.customerId ?? null,
        employee_id: usageContext.employeeId ?? null,
        project_id: usageContext.projectId ?? null,
        conversation_id: conversationId,
        stream: true,
      },
    });
  } catch (error) {
    await aiGateway.logCall({
      tenantId: usageContext.tenantId,
      sceneCode: "decoration_qa",
      providerCode,
      modelCode: routeConfig.modelCode,
      modelName: model,
      status: "failure",
      requestId,
      durationMs: Date.now() - startedAt,
      promptTokens: inputTokens ?? null,
      completionTokens: outputTokens ?? null,
      totalTokens: normalizeTotalTokens({
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens,
      }),
      cachedInputTokens: cachedInputTokens ?? null,
      reasoningTokens: reasoningTokens ?? null,
      rawUsage: {
        prompt_tokens: inputTokens ?? null,
        completion_tokens: outputTokens ?? null,
        total_tokens: totalTokens ?? null,
        prompt_tokens_details: {
          cached_tokens: cachedInputTokens ?? null,
        },
        completion_tokens_details: {
          reasoning_tokens: reasoningTokens ?? null,
        },
      },
      errorCode: error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "AI_STREAM_FAILED")
        : "AI_STREAM_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
      source: usageContext.source,
      billable: usageContext.billable,
      metadata: {
        source: usageContext.source,
        auth_user_id: usageContext.authUserId ?? null,
        customer_id: usageContext.customerId ?? null,
        employee_id: usageContext.employeeId ?? null,
        project_id: usageContext.projectId ?? null,
        conversation_id: conversationId,
        stream: true,
      },
    });
    throw error;
  } finally {
    streamRequest?.clearTimeout();
    reader?.releaseLock();
  }
}

export function serializeDecorationQaStreamEvent(
  event: DecorationQaStreamEvent,
) {
  return toNdjson(event);
}

export async function getDecorationQaSystemPrompt() {
  return getSystemPrompt();
}
