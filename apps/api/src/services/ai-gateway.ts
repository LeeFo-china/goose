import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";
import { SupabaseDB } from "@/utils/supabase";

export type AiGatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiGatewayChatInput = {
  sceneCode: string;
  tenantId?: string | null;
  messages: AiGatewayMessage[];
  temperature?: number;
  responseFormat?: "json_object" | "text" | null;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

export type AiGatewayChatResult = {
  content: string;
  raw: unknown;
  provider: string;
  model: string;
  modelName: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

type AiSceneRouteRow = {
  scene_code: string;
  temperature: number | null;
  response_format: "json_object" | "text" | null;
  timeout_ms: number | null;
  primary_model?: AiModelRow | AiModelRow[] | null;
  fallback_model?: AiModelRow | AiModelRow[] | null;
};

type AiModelRow = {
  code: string;
  model_name: string;
  provider?: AiProviderRow | AiProviderRow[] | null;
};

type AiProviderRow = {
  code: string;
  endpoint_url: string | null;
  api_key_setting_key: string | null;
};

type OpenAiCompatibleResponse = {
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
    code?: string;
    message?: string;
  };
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function readUsageNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

function extractContent(result: OpenAiCompatibleResponse) {
  const rawContent = result.choices?.[0]?.message?.content;
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent.map((item) => item.text || "").join("").trim();
  }
  return "";
}

function normalizeTimeout(value: number | null | undefined, fallback: number) {
  if (!Number.isFinite(value || NaN)) return fallback;
  return Math.max(1000, Math.min(Math.floor(value!), 300000));
}

class AiGateway {
  private client = SupabaseDB.getAdminClient();

  private async findSceneRoute(sceneCode: string) {
    const { data, error } = await this.client
      .from("ai_scene_routes")
      .select(`
        scene_code,
        temperature,
        response_format,
        timeout_ms,
        primary_model:ai_models!ai_scene_routes_primary_model_id_fkey(
          code,
          model_name,
          provider:ai_providers!ai_models_provider_id_fkey(
            code,
            endpoint_url,
            api_key_setting_key
          )
        ),
        fallback_model:ai_models!ai_scene_routes_fallback_model_id_fkey(
          code,
          model_name,
          provider:ai_providers!ai_models_provider_id_fkey(
            code,
            endpoint_url,
            api_key_setting_key
          )
        )
      `)
      .eq("scene_code", sceneCode)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 AI 场景路由失败", error);
    }

    return (data || null) as AiSceneRouteRow | null;
  }

  private async resolveLegacyModel(sceneCode: string) {
    const hasDeepSeekApiKey = Boolean(
      await systemSettingsService.getSecretString("DEEPSEEK_API_KEY"),
    );
    const endpoint = (await systemSettingsService.getString("AI_CHAT_COMPLETIONS_URL"))
      || (hasDeepSeekApiKey
        ? "https://api.deepseek.com/chat/completions"
        : "https://api.openai.com/v1/chat/completions");
    const providerCode = endpoint.includes("api.deepseek.com")
      ? "deepseek"
      : endpoint.includes("api.openai.com")
        ? "openai"
        : "custom";
    const apiKeySettingNames = providerCode === "deepseek"
      ? ["DEEPSEEK_API_KEY", "AI_API_KEY"]
      : ["AI_API_KEY", "DEEPSEEK_API_KEY"];
    let apiKey = "";
    for (const key of apiKeySettingNames) {
      apiKey = await systemSettingsService.getSecretString(key);
      if (apiKey) break;
    }
    if (!apiKey) {
      apiKey = firstNonEmptyEnv(apiKeySettingNames);
    }
    const model = await systemSettingsService.getString("AI_MODEL")
      || (providerCode === "deepseek" ? "deepseek-chat" : firstNonEmptyEnv(["DEEPSEEK_MODEL"]));

    if (!endpoint || !apiKey || !model) {
      throw Errors.business(
        503,
        "缺少 AI 配置",
        "AI_CONFIG_MISSING",
        { sceneCode },
      );
    }

    return {
      providerCode,
      modelCode: model,
      modelName: model,
      endpoint,
      apiKey,
      timeoutMs: await systemSettingsService.getNumber("AI_REQUEST_TIMEOUT_MS", 60000),
    };
  }

  private async resolveRouteModel(input: {
    sceneCode: string;
    route: AiSceneRouteRow | null;
    useFallback?: boolean;
  }) {
    const model = firstRelation(input.useFallback
      ? input.route?.fallback_model
      : input.route?.primary_model);
    const provider = firstRelation(model?.provider);
    if (!model || !provider?.endpoint_url || !provider.api_key_setting_key) {
      return this.resolveLegacyModel(input.sceneCode);
    }

    const apiKey = await systemSettingsService.getSecretString(provider.api_key_setting_key);
    if (!apiKey) {
      return this.resolveLegacyModel(input.sceneCode);
    }

    return {
      providerCode: provider.code,
      modelCode: model.code,
      modelName: model.model_name,
      endpoint: provider.endpoint_url,
      apiKey,
      timeoutMs: input.route?.timeout_ms || await systemSettingsService.getNumber(
        "AI_REQUEST_TIMEOUT_MS",
        60000,
      ),
    };
  }

  private async getOpenRouterHeaders(endpoint: string): Promise<Record<string, string>> {
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
        "gooes-ai-gateway",
      ),
    };
  }

  private async requestChat(input: {
    endpoint: string;
    apiKey: string;
    model: string;
    messages: AiGatewayMessage[];
    temperature: number;
    responseFormat?: "json_object" | "text" | null;
    timeoutMs: number;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetch(input.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
          ...await this.getOpenRouterHeaders(input.endpoint),
        },
        body: JSON.stringify({
          model: input.model,
          temperature: input.temperature,
          messages: input.messages,
          ...(input.responseFormat === "json_object"
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as OpenAiCompatibleResponse;
      if (!response.ok) {
        throw Errors.business(
          502,
          result.error?.message || "AI 调用失败",
          result.error?.code || "AI_GATEWAY_REQUEST_FAILED",
          { statusCode: response.status },
        );
      }
      return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw Errors.business(504, "AI 调用超时", "AI_GATEWAY_TIMEOUT");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async logCall(input: {
    tenantId?: string | null;
    sceneCode: string;
    providerCode?: string | null;
    modelCode?: string | null;
    modelName?: string | null;
    status: "success" | "failure";
    requestId?: string | null;
    durationMs?: number | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const { error } = await this.client
      .from("ai_call_logs")
      .insert({
        tenant_id: input.tenantId || null,
        scene_code: input.sceneCode,
        provider_code: input.providerCode || null,
        model_code: input.modelCode || null,
        model_name: input.modelName || null,
        status: input.status,
        request_id: input.requestId || null,
        duration_ms: input.durationMs ?? null,
        prompt_tokens: input.promptTokens ?? null,
        completion_tokens: input.completionTokens ?? null,
        total_tokens: input.totalTokens ?? null,
        error_code: input.errorCode || null,
        error_message: input.errorMessage || null,
        metadata: input.metadata || null,
      });

    // AI 日志不能影响主业务链路。
    if (error) return;
  }

  async chat(input: AiGatewayChatInput): Promise<AiGatewayChatResult> {
    const route = await this.findSceneRoute(input.sceneCode);
    const temperature = input.temperature ?? route?.temperature ?? 0.7;
    const responseFormat = input.responseFormat ?? route?.response_format ?? null;
    const hasFallbackModel = Boolean(firstRelation(route?.fallback_model));

    const attempt = async (useFallback: boolean) => {
      const model = await this.resolveRouteModel({
        sceneCode: input.sceneCode,
        route,
        useFallback,
      });
      const timeoutMs = normalizeTimeout(input.timeoutMs ?? route?.timeout_ms, model.timeoutMs);
      const startedAt = Date.now();
      const raw = await this.requestChat({
        endpoint: model.endpoint,
        apiKey: model.apiKey,
        model: model.modelName,
        messages: input.messages,
        temperature,
        responseFormat,
        timeoutMs,
      });
      const usage = raw.usage || {};
      const result = {
        content: extractContent(raw),
        raw,
        provider: model.providerCode,
        model: model.modelCode,
        modelName: model.modelName,
        promptTokens: readUsageNumber(usage.prompt_tokens),
        completionTokens: readUsageNumber(usage.completion_tokens),
        totalTokens: readUsageNumber(usage.total_tokens),
      };
      await this.logCall({
        tenantId: input.tenantId,
        sceneCode: input.sceneCode,
        providerCode: model.providerCode,
        modelCode: model.modelCode,
        modelName: model.modelName,
        status: "success",
        requestId: raw.id || null,
        durationMs: Date.now() - startedAt,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        metadata: {
          ...(input.metadata || {}),
          ai_attempt: useFallback ? "fallback" : "primary",
        },
      });
      return result;
    };

    const logFailure = async (inputError: unknown, useFallback: boolean) => {
      const failedModel = await this.resolveRouteModel({
        sceneCode: input.sceneCode,
        route,
        useFallback,
      });
      const code = inputError && typeof inputError === "object" && "code" in inputError
        ? String((inputError as { code?: unknown }).code || "AI_GATEWAY_FAILED")
        : "AI_GATEWAY_FAILED";
      await this.logCall({
        tenantId: input.tenantId,
        sceneCode: input.sceneCode,
        providerCode: failedModel.providerCode,
        modelCode: failedModel.modelCode,
        modelName: failedModel.modelName,
        status: "failure",
        durationMs: null,
        errorCode: code,
        errorMessage: inputError instanceof Error ? inputError.message : String(inputError),
        metadata: {
          ...(input.metadata || {}),
          ai_attempt: useFallback ? "fallback" : "primary",
        },
      });
    };

    try {
      return await attempt(false);
    } catch (error) {
      await logFailure(error, false);
      if (hasFallbackModel) {
        try {
          return await attempt(true);
        } catch (fallbackError) {
          await logFailure(fallbackError, true);
          throw fallbackError;
        }
      }
      throw error;
    }
  }
}

export const aiGateway = new AiGateway();
