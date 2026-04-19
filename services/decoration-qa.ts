import type { DecorationQaRequestInput } from "@/schema/ai";
import type { AiMessageRole } from "@gooes/domain";

type DecorationQaResult = {
  answer: string;
  suggestions: string[];
};

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
  messages: Array<{ role: AiMessageRole | "system"; content: string }>;
  response_format?: { type: "json_object" };
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

function requireAiEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`缺少 AI 环境变量: ${name}`);
  }

  return value;
}

function getAiEndpoint() {
  return process.env.AI_CHAT_COMPLETIONS_URL?.trim() || "https://api.openai.com/v1/chat/completions";
}

function getAiRequestTimeoutMs() {
  const raw = process.env.AI_REQUEST_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : 60000;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60000;
  }

  return parsed;
}

function getSystemPrompt() {
  const customPrompt = process.env.DECORATION_QA_SYSTEM_PROMPT?.trim();

  if (!customPrompt) {
    return `${DEFAULT_SYSTEM_PROMPT}${JSON_OUTPUT_PROMPT}`;
  }

  return `${customPrompt}\n\n${DEFAULT_SYSTEM_PROMPT}${JSON_OUTPUT_PROMPT}`;
}

function getOpenRouterHeaders(): Record<string, string> {
  const endpoint = getAiEndpoint();

  if (!endpoint.includes("openrouter.ai")) {
    return {};
  }

  return {
    "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://gooes.local",
    "X-Title": process.env.OPENROUTER_APP_NAME?.trim() || "gooes-decoration-qa",
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

async function requestQaResult(
  endpoint: string,
  apiKey: string,
  requestBody: OpenAiRequestBody,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getAiRequestTimeoutMs());
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...getOpenRouterHeaders(),
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const result = await response.json() as OpenAiChatResponse;

    if (!response.ok) {
      throw new Error(result.error?.message || "大模型接口调用失败");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function askDecorationQa(input: DecorationQaRequestInput): Promise<DecorationQaResult> {
  const apiKey = requireAiEnv("AI_API_KEY");
  const model = requireAiEnv("AI_MODEL");
  const endpoint = getAiEndpoint();
  const systemPrompt = getSystemPrompt();

  const messages: OpenAiRequestBody["messages"] = [
    { role: "system", content: systemPrompt },
    ...input.history,
    { role: "user", content: input.question },
  ];

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
    throw new Error("大模型未返回有效内容");
  }

  return parseQaResult(content);
}

export function getDecorationQaSystemPrompt() {
  return getSystemPrompt();
}
