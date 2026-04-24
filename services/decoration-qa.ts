import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  DecorationQaRequestInput,
  DecorationQaStreamRequestInput,
} from "@/schema/ai";
import type { Tables } from "@/types/database";
import {
  PROJECT_LOG_STAGE_CONFIG,
  ProjectStatusConfig,
  isProjectLogStageCode,
  isProjectStatus,
  type AiMessageRole,
  type ProjectLogStageCode,
} from "@gooes/domain";

type DecorationQaResult = {
  answer: string;
  suggestions: string[];
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
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type OpenAiChatStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
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

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的家装顾问，隶属于“河南蜜居装饰有限公司”。
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

type CustomerContextRow = Pick<
  Tables<"customers">,
  "id" | "name" | "user_id"
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

  return requireAiEnv(envNames, "AI_API_KEY / DEEPSEEK_API_KEY");
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

  if (endpoint.includes("api.deepseek.com")) {
    return "deepseek-chat";
  }

  throw Errors.dbError("缺少 AI 环境变量: AI_MODEL / DEEPSEEK_MODEL");
}

function getAiRequestTimeoutMs() {
  const raw = process.env.AI_REQUEST_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : 60000;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60000;
  }

  return parsed;
}

function getBaseSystemPrompt() {
  const customPrompt = process.env.DECORATION_QA_SYSTEM_PROMPT?.trim();
  return customPrompt
    ? `${customPrompt}\n\n${DEFAULT_SYSTEM_PROMPT}`
    : DEFAULT_SYSTEM_PROMPT;
}

function getSystemPrompt() {
  return `${getBaseSystemPrompt()}${JSON_OUTPUT_PROMPT}`;
}

function getStreamingSystemPrompt() {
  return `${getBaseSystemPrompt()}${STREAM_OUTPUT_PROMPT}`;
}

function getOpenRouterHeaders(): Record<string, string> {
  const endpoint = getAiEndpoint();

  if (!endpoint.includes("openrouter.ai")) {
    return {};
  }

  return {
    "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim()
      || "https://gooes.local",
    "X-Title": process.env.OPENROUTER_APP_NAME?.trim()
      || "gooes-decoration-qa",
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

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...getOpenRouterHeaders(),
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
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select("id, name, user_id")
    .eq("user_id", authUserId)
    .limit(2);

  if (error) {
    throw Errors.dbError("查询客户身份失败", error);
  }

  const list = (data || []) as CustomerContextRow[];
  if (list.length > 1) {
    throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
  }

  if (!list[0]) {
    throw Errors.forbidden();
  }

  return list[0];
}

async function buildCustomerProjectQaContext(
  authUserId: string,
  projectId: string,
): Promise<CustomerProjectQaContext> {
  const customer = await getCustomerContextByAuthUserId(authUserId);
  const { data: projectData, error: projectError } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select(`
      id,
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
    .order("created_at", { ascending: false })
    .limit(5);

  if (logsError) {
    throw Errors.dbError("查询客户项目日志上下文失败", logsError);
  }

  const project = projectData as unknown as ProjectQaProjectRow;
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
    project_id: project.id,
    project_name: project.name,
    status,
    status_label: status ? ProjectStatusConfig[status].label : null,
    address: project.address,
    start_date: project.start_date,
    style_tags: normalizeStringArray(project.style_tags),
    property: property.community || property.building_info || property.layout || property.area
      ? {
        community: typeof property.community === "string" ? property.community : null,
        building_info: typeof property.building_info === "string"
          ? property.building_info
          : null,
        layout: typeof property.layout === "string" ? property.layout : null,
        area: typeof property.area === "number" ? property.area : null,
      }
      : null,
    designer_name: typeof designer.name === "string" ? designer.name : null,
    supervisor_name: typeof supervisor.name === "string" ? supervisor.name : null,
    recent_logs: ((logsData || []) as ProjectQaLogRow[]).map((item) => {
      const stageCode = isProjectLogStageCode(item.stage_code)
        ? item.stage_code
        : null;

      return {
        stage_code: stageCode,
        stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
        node_name: item.node_name,
        content: item.content,
        created_at: item.created_at,
      };
    }),
  };
}

function formatCustomerProjectQaContext(context: CustomerProjectQaContext) {
  const lines: string[] = [
    "以下是当前客户项目上下文，仅可基于这些已同步资料回答项目相关问题。",
    "如果上下文不足，请明确说明“根据当前已同步的项目资料，暂时无法确认更多细节”。",
    "不要虚构施工进度、团队成员、时间计划或未发生的项目节点。",
    "",
    "当前客户项目上下文：",
    `- 客户名称：${context.customer_name || "未同步"}`,
    `- 项目名称：${context.project_name || "未同步"}`,
    `- 项目状态：${context.status_label || context.status || "未同步"}`,
    `- 项目地址：${context.address || "未同步"}`,
    `- 开工日期：${context.start_date || "未同步"}`,
    `- 风格标签：${context.style_tags.length ? context.style_tags.join("、") : "未同步"}`,
    `- 主案设计：${context.designer_name || "未同步"}`,
    `- 施工管理：${context.supervisor_name || "未同步"}`,
  ];

  if (context.property) {
    lines.push(
      `- 房产信息：${[
        context.property.community,
        context.property.building_info,
        context.property.layout,
        context.property.area ? `${context.property.area}㎡` : null,
      ].filter(Boolean).join("，") || "未同步"}`,
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

  return lines.join("\n");
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
  const timeout = setTimeout(() => controller.abort(), getAiRequestTimeoutMs());

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(apiKey),
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

function createStreamRequestBody(
  input: DecorationQaStreamRequestInput,
  model: string,
  extraSystemMessages: string[] = [],
): OpenAiRequestBody {
  return {
    model,
    temperature: 0.7,
    messages: buildMessages(
      input.question,
      [],
      getStreamingSystemPrompt(),
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
  const timeout = setTimeout(() => controller.abort(), getAiRequestTimeoutMs());

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildHeaders(apiKey),
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
): Promise<DecorationQaResult> {
  const apiKey = getAiApiKey();
  const model = getAiModel();
  const endpoint = getAiEndpoint();

  const messages = buildMessages(input.question, input.history, getSystemPrompt());

  let result: OpenAiChatResponse;

  try {
    result = await requestQaResult(endpoint, apiKey, {
      model,
      temperature: 0.7,
      messages,
      response_format: { type: "json_object" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await requestQaResult(endpoint, apiKey, {
      model,
      temperature: 0.7,
      messages,
    });
  }

  const content = extractContent(result.choices);

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
    extraSystemMessages?: string[];
    signal?: AbortSignal;
  },
) {
  const apiKey = getAiApiKey();
  const model = getAiModel();
  const endpoint = getAiEndpoint();
  const conversationId = input.conversation_id?.trim() || `qa_${randomUUID()}`;
  const extraSystemMessages = options?.extraSystemMessages
    || await resolveDecorationQaStreamSystemMessages(input, options?.authUserId);

  const streamRequest = await requestQaStream(
    endpoint,
    apiKey,
    createStreamRequestBody(input, model, extraSystemMessages),
    options?.signal,
  );

  const reader = streamRequest.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    await onEvent({
      type: "start",
      conversation_id: conversationId,
    });

    while (true) {
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

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
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
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
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
  } finally {
    streamRequest.clearTimeout();
    reader.releaseLock();
  }
}

export function serializeDecorationQaStreamEvent(event: DecorationQaStreamEvent) {
  return toNdjson(event);
}

export function getDecorationQaSystemPrompt() {
  return getSystemPrompt();
}
