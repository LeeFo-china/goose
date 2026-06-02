import { Errors, systemSettingsService } from "./shared";
import type { OpenAiChatResponse, OpenAiRequestBody } from "./shared";

export function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return "";
}

export function requireAiEnv(names: string[], label: string) {
  const value = firstNonEmptyEnv(names);
  if (!value) {
    throw Errors.business(503, `缺少 AI 配置: ${label}`, "SOCIAL_VIDEO_SCRIPT_AI_CONFIG_MISSING");
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
  const explicit = await systemSettingsService.getString("SOCIAL_VIDEO_SCRIPT_AI_MODEL");
  if (explicit) return explicit;

  const shared = await systemSettingsService.getString("AI_MODEL");
  if (shared) return shared;

  if (endpoint.includes("api.deepseek.com")) {
    return "deepseek-chat";
  }

  throw Errors.business(
    503,
    "缺少 AI 模型配置",
    "SOCIAL_VIDEO_SCRIPT_AI_CONFIG_MISSING",
  );
}

export async function getAiRequestTimeoutMs() {
  const parsed = await systemSettingsService.getNumber("SOCIAL_VIDEO_SCRIPT_AI_TIMEOUT_MS", 25000);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 25000;
  }

  return Math.max(5000, Math.min(parsed, 60000));
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
      "gooes-social-video-script",
    ),
  };
}

export function getModelProvider(endpoint: string) {
  if (endpoint.includes("api.deepseek.com")) return "deepseek";
  if (endpoint.includes("openrouter.ai")) return "openrouter";
  if (endpoint.includes("api.openai.com")) return "openai";
  return "custom";
}

export async function buildHeaders(apiKey: string, endpoint: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    ...await getOpenRouterHeaders(endpoint),
  };
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
      throw Errors.business(
        502,
        result.error?.message || "AI 生成拍摄脚本失败",
        "SOCIAL_VIDEO_SCRIPT_AI_FAILED",
        { statusCode: response.status },
      );
    }

    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw Errors.business(504, "AI 生成拍摄脚本超时", "SOCIAL_VIDEO_SCRIPT_AI_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
