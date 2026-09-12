import { Errors } from "@/errors/error-factory";
import { arkEndpoint } from "@/gateways/ark-rendering/requests";
import type {
  AiGatewayResolvedImageConfig,
  AiModelRow,
  AiSceneRouteRow,
} from "./ai-gateway-types";

interface ImageConfigSettings {
  getSecretString(key: string): Promise<string>;
  getNumber(key: string, fallback: number): Promise<number>;
}

interface ResolveAiImageConfigInput {
  sceneCode: string;
  route: AiSceneRouteRow | null;
  settings: ImageConfigSettings;
  timeoutMs?: number;
  useFallback?: boolean;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function normalizeTimeout(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value || Number.NaN)) return fallback;
  return Math.max(1000, Math.min(Math.floor(value!), 300000));
}

function missingConfig(sceneCode: string): never {
  throw Errors.business(503, "缺少 AI 图片模型配置", "AI_CONFIG_MISSING", {
    sceneCode,
  });
}

export async function resolveAiImageConfig(
  input: ResolveAiImageConfigInput,
): Promise<AiGatewayResolvedImageConfig> {
  const model = firstRelation(input.useFallback
    ? input.route?.fallback_model
    : input.route?.primary_model);
  const provider = firstRelation(model?.provider);
  if (!model || !provider?.endpoint_url || !provider.api_key_setting_key) {
    return missingConfig(input.sceneCode);
  }
  if (input.route?.modality !== "image" || model.modality !== "image") {
    throw Errors.business(400, "该模型模态尚未接入图片运行时", "AI_MODALITY_RUNTIME_UNSUPPORTED");
  }
  if (model.status !== "active") {
    throw Errors.business(409, "AI 模型已停用，请调整场景路由", "AI_MODEL_INACTIVE");
  }
  if (provider.status !== "active") {
    throw Errors.business(409, "AI 供应商已停用，请调整场景路由", "AI_PROVIDER_INACTIVE");
  }
  if (provider.provider_type !== "openai_compatible") {
    throw Errors.business(400, "图片模型供应商协议暂不支持", "AI_PROVIDER_PROTOCOL_UNSUPPORTED");
  }
  const apiKey = await input.settings.getSecretString(provider.api_key_setting_key);
  if (!apiKey) return missingConfig(input.sceneCode);
  const timeoutMs = normalizeTimeout(
    input.timeoutMs ?? input.route.timeout_ms,
    await input.settings.getNumber("AI_REQUEST_TIMEOUT_MS", 60000),
  );
  const endpoint = arkEndpoint({
    baseUrl: provider.endpoint_url,
    apiKey,
    model: model.model_name,
    timeoutMs,
  }, "/images/generations");

  return {
    providerCode: provider.code,
    providerType: provider.provider_type,
    modelCode: model.code,
    modelName: model.model_name,
    baseUrl: endpoint.slice(0, -"/images/generations".length),
    apiKey,
    timeoutMs,
  };
}
