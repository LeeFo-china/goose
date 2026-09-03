import type { AiModelRecord, AiProviderRecord } from "@/components/platform-ai/ai-config-types";
import { requestBackendJson } from "@/lib/backend-client";

export type ProviderFormState = {
  id?: string;
  version?: number | null;
  code: string;
  name: string;
  provider_type: "openai_compatible" | "openrouter";
  endpoint_url: string;
  api_key_setting_key: string;
  status: "active" | "inactive";
  sort_order: string;
};

export type ModelFormState = {
  id?: string;
  version?: number | null;
  provider_id: string;
  code: string;
  name: string;
  model_name: string;
  status: "active" | "inactive";
  sort_order: string;
};

export type RouteFormState = {
  id?: string;
  version?: number | null;
  scene_code: string;
  name: string;
  primary_model_id: string;
  fallback_model_id: string;
  quality_tier: "fast" | "balanced" | "quality";
  modality: "text" | "image" | "video" | "speech";
  temperature: string;
  response_format: "json_object" | "text";
  timeout_ms: string;
  status: "active" | "inactive";
};

export const NONE_VALUE = "__none";
export const OPENROUTER_API_KEY_SETTING_KEY = "OPENROUTER_API_KEY";

export function isDirectSecretLikeSettingKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("sk-") || normalized.startsWith("sk_") || normalized.startsWith("bearer ");
}

export function emptyProviderForm(): ProviderFormState {
  return {
    code: "",
    name: "",
    provider_type: "openai_compatible",
    endpoint_url: "",
    api_key_setting_key: "",
    status: "active",
    sort_order: "0",
  };
}

export function normalizeProviderFormForType(
  form: ProviderFormState,
  providerType: ProviderFormState["provider_type"],
): ProviderFormState {
  if (providerType !== "openrouter") {
    return { ...form, provider_type: "openai_compatible" };
  }

  const currentKey = form.api_key_setting_key.trim();
  return {
    ...form,
    provider_type: "openrouter",
    api_key_setting_key: currentKey && !isDirectSecretLikeSettingKey(currentKey)
      ? currentKey
      : OPENROUTER_API_KEY_SETTING_KEY,
  };
}

export function providerFormFromRecord(item: AiProviderRecord): ProviderFormState {
  const providerType = item.provider_type === "openrouter" ? "openrouter" : "openai_compatible";
  const apiKeySettingKey = item.api_key_setting_key || "";
  const normalizedKey = isDirectSecretLikeSettingKey(apiKeySettingKey) ? "" : apiKeySettingKey;

  return normalizeProviderFormForType({
    id: item.id,
    version: item.version ?? 1,
    code: item.code,
    name: item.name,
    provider_type: providerType,
    endpoint_url: item.endpoint_url || "",
    api_key_setting_key: normalizedKey,
    status: item.status,
    sort_order: String(item.sort_order ?? 0),
  }, providerType);
}

export function providerKeyDisplay(value: string | null | undefined): string {
  if (!value) return "-";
  return isDirectSecretLikeSettingKey(value) ? "已隐藏真实密钥" : value;
}

export function emptyModelForm(providerId = ""): ModelFormState {
  return {
    provider_id: providerId,
    code: "",
    name: "",
    model_name: "",
    status: "active",
    sort_order: "0",
  };
}

export function emptyRouteForm(modelId = ""): RouteFormState {
  return {
    scene_code: "",
    name: "",
    primary_model_id: modelId,
    fallback_model_id: NONE_VALUE,
    quality_tier: "balanced",
    modality: "text",
    temperature: "0.7",
    response_format: "json_object",
    timeout_ms: "60000",
    status: "active",
  };
}

export async function requestBackend<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}

export function modelLabel(model?: AiModelRecord | null) {
  if (!model) return "未配置";
  return `${model.name} · ${model.model_name}`;
}

export function modelOptionLabel(model: AiModelRecord) {
  return `${model.name} / ${model.model_name}`;
}
