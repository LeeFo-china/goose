import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import type {
  DecorationQaRequestInput,
  DecorationQaStreamRequestInput,
} from "@/schema/ai";
import type { AiMessageRole } from "@gooes/domain";

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

function requireAiEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw Errors.dbError(`缺少 AI 环境变量: ${name}`);
  }

  return value;
}

function getAiEndpoint() {
  return process.env.AI_CHAT_COMPLETIONS_URL?.trim()
    || "https://api.openai.com/v1/chat/completions";
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
): OpenAiRequestBody["messages"] {
  return [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: question },
  ];
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
): OpenAiRequestBody {
  return {
    model,
    temperature: 0.7,
    messages: buildMessages(input.question, [], getStreamingSystemPrompt()),
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
  const apiKey = requireAiEnv("AI_API_KEY");
  const model = requireAiEnv("AI_MODEL");
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
    signal?: AbortSignal;
  },
) {
  const apiKey = requireAiEnv("AI_API_KEY");
  const model = requireAiEnv("AI_MODEL");
  const endpoint = getAiEndpoint();
  const conversationId = input.conversation_id?.trim() || `qa_${randomUUID()}`;

  const streamRequest = await requestQaStream(
    endpoint,
    apiKey,
    createStreamRequestBody(input, model),
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
