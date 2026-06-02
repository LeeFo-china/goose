import { Errors, systemSettingsService } from "./shared";
import type { OpenAiChatResponse, OpenAiRequestBody } from "./shared";

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

export async function getAiRequestTimeoutMs() {
  const parsed = await systemSettingsService.getNumber("AI_REQUEST_TIMEOUT_MS", 60000);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60000;
  }

  return parsed;
}

export async function getOpenRouterHeaders(endpoint: string): Promise<Record<string, string>> {
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

export async function buildHeaders(apiKey: string, endpoint: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    ...await getOpenRouterHeaders(endpoint),
  };
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

export async function requestAiResult(
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
