import { Errors } from "@/errors/error-factory";
import { aiInferenceEndpoint } from "@/gateways/ark-rendering/requests";
import { systemSettingsService } from "@/services/system-settings";
import { SupabaseDB } from "@/utils/supabase";
import { resolveAiImageConfig } from "./ai-gateway-image-config";
import type { AiGatewayChatInput, AiGatewayChatResult, AiGatewayFetch,
  AiGatewayProviderType, AiGatewayMessage, AiGatewayResolvedChatConfig,
  AiGatewayResolvedImageConfig,
  AiModelRow, AiProviderRow, AiSceneRouteRow,
  OpenAiCompatibleResponse } from "./ai-gateway-types";

export type { AiGatewayChatInput, AiGatewayChatResult, AiGatewayProviderType,
  AiGatewayMessage, AiGatewayResolvedChatConfig,
  AiGatewayResolvedImageConfig } from "./ai-gateway-types";

type AiGatewaySettings = Pick<
  typeof systemSettingsService,
  "getSecretString" | "getString" | "getNumber"
>;
export type AiGatewayDependencies = {
  client?: ReturnType<typeof SupabaseDB.getAdminClient>;
  fetchImpl?: AiGatewayFetch;
  settingsService?: AiGatewaySettings;
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
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

function extractCachedInputTokens(usage: OpenAiCompatibleResponse["usage"]) {
  return readUsageNumber(usage?.prompt_tokens_details?.cached_tokens);
}

function extractReasoningTokens(usage: OpenAiCompatibleResponse["usage"]) {
  return readUsageNumber(usage?.completion_tokens_details?.reasoning_tokens);
}

function extractContent(result: OpenAiCompatibleResponse) {
  const rawContent = result.choices?.[0]?.message?.content;
  if (typeof rawContent === "string") return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent.map((item) => item.text || "").join("").trim();
  }
  return "";
}

function normalizeOpenAiCompatibleResponse(value: unknown): OpenAiCompatibleResponse {
  return value && typeof value === "object" ? (value as OpenAiCompatibleResponse) : {};
}

function normalizeTimeout(value: number | null | undefined, fallback: number) {
  if (!Number.isFinite(value || NaN)) return fallback;
  return Math.max(1000, Math.min(Math.floor(value!), 300000));
}

function chatInferenceEndpoint(baseUrl: string, modality: AiModelRow["modality"]) {
  try {
    const endpoint = aiInferenceEndpoint(baseUrl, modality);
    if (modality === "text") return endpoint;
    throw Errors.business(400, "该模型模态尚未接入运行时", "AI_MODALITY_RUNTIME_UNSUPPORTED");
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw Errors.business(500, "AI 供应商基础地址配置无效", "AI_PROVIDER_ENDPOINT_INVALID");
  }
}

export class AiGateway {
  private readonly client;
  private readonly fetchImpl;
  private readonly settingsService;

  constructor(dependencies: AiGatewayDependencies = {}) {
    this.client = dependencies.client ?? SupabaseDB.getAdminClient();
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
  }

  private async findSceneRoute(sceneCode: string) {
    const { data, error } = await this.client
      .from("ai_scene_routes")
      .select(`
        scene_code,
        modality,
        temperature,
        response_format,
        timeout_ms,
        primary_model:ai_models!ai_scene_routes_primary_model_id_fkey(
          code,
          model_name,
          modality,
          status,
          provider:ai_providers!ai_models_provider_id_fkey(
            code,
            provider_type,
            status,
            endpoint_url,
            api_key_setting_key
          )
        ),
        fallback_model:ai_models!ai_scene_routes_fallback_model_id_fkey(
          code,
          model_name,
          modality,
          status,
          provider:ai_providers!ai_models_provider_id_fkey(
            code,
            provider_type,
            status,
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
      await this.settingsService.getSecretString("DEEPSEEK_API_KEY"),
    );
    const endpoint = (await this.settingsService.getString("AI_CHAT_COMPLETIONS_URL"))
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
      apiKey = await this.settingsService.getSecretString(key);
      if (apiKey) break;
    }
    if (!apiKey) {
      apiKey = firstNonEmptyEnv(apiKeySettingNames);
    }
    const model = await this.settingsService.getString("AI_MODEL")
      || (providerCode === "deepseek" ? "deepseek-chat" : firstNonEmptyEnv(["DEEPSEEK_MODEL"]));

    if (!endpoint || !apiKey || !model) {
      throw Errors.business(
        503,
        "缺少 AI 配置",
        "AI_CONFIG_MISSING",
        { sceneCode },
      );
    }
    const canonicalEndpoint = chatInferenceEndpoint(endpoint, "text");

    return {
      providerCode,
      providerType: new URL(canonicalEndpoint).hostname === "openrouter.ai"
        ? "openrouter" as const : "openai_compatible" as const,
      modelCode: model,
      modelName: model,
      endpoint: canonicalEndpoint,
      apiKey,
      timeoutMs: await this.settingsService.getNumber("AI_REQUEST_TIMEOUT_MS", 60000),
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
    const modality = model?.modality ?? input.route?.modality ?? "text";
    if (modality !== "text") throw Errors.business(400, "该模型模态尚未接入运行时", "AI_MODALITY_RUNTIME_UNSUPPORTED");
    const provider = firstRelation(model?.provider);
    if (!model || !provider?.endpoint_url || !provider.api_key_setting_key) {
      return this.resolveLegacyModel(input.sceneCode);
    }
    if (model.status !== "active") {
      throw Errors.business(409, "AI 模型已停用，请调整场景路由", "AI_MODEL_INACTIVE");
    }
    if (provider.status !== "active") {
      throw Errors.business(409, "AI 供应商已停用，请调整场景路由", "AI_PROVIDER_INACTIVE");
    }
    const apiKey = await this.settingsService.getSecretString(provider.api_key_setting_key);
    if (!apiKey) {
      return this.resolveLegacyModel(input.sceneCode);
    }
    return {
      providerCode: provider.code,
      providerType: provider.provider_type,
      modelCode: model.code,
      modelName: model.model_name,
      endpoint: chatInferenceEndpoint(provider.endpoint_url, model.modality),
      apiKey,
      timeoutMs: input.route?.timeout_ms || await this.settingsService.getNumber(
        "AI_REQUEST_TIMEOUT_MS",
        60000,
      ),
    };
  }

  private async getOpenRouterHeaders(providerType: AiProviderRow["provider_type"]): Promise<Record<string, string>> {
    if (providerType !== "openrouter") return {};

    return {
      "HTTP-Referer": await this.settingsService.getString(
        "OPENROUTER_HTTP_REFERER",
        "https://gooes.local",
      ),
      "X-Title": await this.settingsService.getString(
        "OPENROUTER_APP_NAME",
        "gooes-ai-gateway",
      ),
    };
  }

  private async requestChat(input: {
    endpoint: string;
    providerType: AiProviderRow["provider_type"];
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
      const response = await this.fetchImpl(input.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
          ...await this.getOpenRouterHeaders(input.providerType),
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
      const result = normalizeOpenAiCompatibleResponse(await response.json().catch(() => ({})));
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

  async logCall(input: {
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
    cachedInputTokens?: number | null;
    reasoningTokens?: number | null;
    rawUsage?: unknown;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
    source?: string | null;
    billable?: boolean;
  }) {
    const payload = {
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
      cached_input_tokens: input.cachedInputTokens ?? null,
      reasoning_tokens: input.reasoningTokens ?? null,
      raw_usage: input.rawUsage ?? null,
      error_code: input.errorCode || null,
      error_message: input.errorMessage || null,
      metadata: input.metadata || null,
      source: input.source || null,
      billable: input.billable ?? true,
    };

    const { error } = await (this.client as unknown as { from: (table: string) => any })
      .from("ai_call_logs")
      .insert(payload)
      .select("id");

    // AI 日志不能影响主业务链路。
    if (error) return;
  }

  async resolveChatConfig(input: {
    sceneCode: string;
    temperature?: number;
    responseFormat?: "json_object" | "text" | null;
    timeoutMs?: number;
    useFallback?: boolean;
  }): Promise<AiGatewayResolvedChatConfig> {
    const route = await this.findSceneRoute(input.sceneCode);
    const model = await this.resolveRouteModel({
      sceneCode: input.sceneCode,
      route,
      useFallback: input.useFallback,
    });

    return {
      providerCode: model.providerCode,
      providerType: model.providerType,
      modelCode: model.modelCode,
      modelName: model.modelName,
      endpoint: model.endpoint,
      apiKey: model.apiKey,
      timeoutMs: normalizeTimeout(input.timeoutMs ?? route?.timeout_ms, model.timeoutMs),
      temperature: input.temperature ?? route?.temperature ?? 0.7,
      responseFormat: input.responseFormat ?? route?.response_format ?? null,
    };
  }

  async resolveImageConfig(input: {
    sceneCode: string;
    timeoutMs?: number;
    useFallback?: boolean;
  }): Promise<AiGatewayResolvedImageConfig> {
    return resolveAiImageConfig({
      ...input,
      route: await this.findSceneRoute(input.sceneCode),
      settings: this.settingsService,
    });
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
        providerType: model.providerType,
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
        cachedInputTokens: extractCachedInputTokens(usage),
        reasoningTokens: extractReasoningTokens(usage),
        rawUsage: usage,
        metadata: {
          ...(input.metadata || {}),
          ai_attempt: useFallback ? "fallback" : "primary",
        },
        source: input.source,
        billable: input.billable,
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
        source: input.source,
        billable: input.billable,
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
