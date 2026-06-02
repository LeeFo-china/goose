import {
  Errors,
  systemSettingsService,
  type DecorationQaRequestInput,
  type DecorationQaSuggestionScene,
  type AiMessageRole,
  type DecorationQaResult,
  type OpenAiChatResponse,
  type OpenAiChatStreamChunk,
  type OpenAiRequestBody,
  DEFAULT_SYSTEM_PROMPT,
  FALLBACK_CUSTOMER,
  FALLBACK_EMPLOYEE,
  FALLBACK_VISITOR,
  JSON_OUTPUT_PROMPT,
  STREAM_OUTPUT_PROMPT,
} from './shared';

export function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export function requireAiEnv(names: string[], label: string) {
  const value = firstNonEmptyEnv(names);

  if (!value) {
    throw Errors.dbError(`缺少 AI 环境变量: ${label}`);
  }

  return value;
}

export async function getAiEndpoint() {
  const hasDeepSeekApiKey = Boolean(
    await systemSettingsService.getSecretString("DEEPSEEK_API_KEY"),
  );
  return (await systemSettingsService.getString("AI_CHAT_COMPLETIONS_URL")) ||
    (hasDeepSeekApiKey
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

  return requireAiEnv(envNames, "AI_API_KEY / DEEPSEEK_API_KEY");
}

export async function getAiModel(endpoint: string) {
  const explicit = await systemSettingsService.getString("AI_MODEL");
  if (explicit) {
    return explicit;
  }

  if (endpoint.includes("api.deepseek.com")) {
    return "deepseek-chat";
  }

  throw Errors.dbError("缺少 AI 环境变量: AI_MODEL / DEEPSEEK_MODEL");
}

export function getAiProviderCode(endpoint: string) {
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

export async function getAiRequestTimeoutMs() {
  const parsed = await systemSettingsService.getNumber(
    "AI_REQUEST_TIMEOUT_MS",
    60000,
  );

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60000;
  }

  return parsed;
}

export async function getBaseSystemPrompt() {
  const customPrompt = await systemSettingsService.getString(
    "DECORATION_QA_SYSTEM_PROMPT",
  );
  return customPrompt || DEFAULT_SYSTEM_PROMPT;
}

export async function getSystemPrompt() {
  return `${await getBaseSystemPrompt()}${JSON_OUTPUT_PROMPT}`;
}

export async function getStreamingSystemPrompt() {
  return `${await getBaseSystemPrompt()}${STREAM_OUTPUT_PROMPT}`;
}

export async function getOpenRouterHeaders(
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

export function normalizeSuggestions(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

export function getFallbackSuggestionQuestions(scene: DecorationQaSuggestionScene) {
  if (scene === "customer") {
    return FALLBACK_CUSTOMER.slice(0, 4);
  }

  if (scene === "employee") {
    return FALLBACK_EMPLOYEE.slice(0, 4);
  }

  return FALLBACK_VISITOR.slice(0, 4);
}

export function stripSuggestionPrefix(value: string) {
  return value
    .replace(/^\s*(?:[-*•]+|\d+[.、)]|[一二三四五六七八九十]+[、.)])\s*/u, "")
    .trim();
}

export function getSuggestionLength(value: string) {
  return Array.from(value).length;
}

export function tryParseSuggestionJson(rawContent: string) {
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

export function normalizeSuggestionQuestions(
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

export function extractContent(content: OpenAiChatResponse["choices"]) {
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

export function extractDeltaContent(content: OpenAiChatStreamChunk["choices"]) {
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

export function parseQaResult(rawContent: string): DecorationQaResult {
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

export async function buildHeaders(
  apiKey: string,
  endpoint: string,
): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...await getOpenRouterHeaders(endpoint),
  };
}

export function buildMessages(
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

export function normalizeTotalTokens(input: {
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
