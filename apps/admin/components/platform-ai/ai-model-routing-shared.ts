import type {
  AiModelRecord,
  AiProviderRecord,
  AiRouteModelOptionRecord,
} from "@/components/platform-ai/ai-config-types";
import { requestBackendJson } from "@/lib/backend-client";
import { isAiSecretSettingKey } from "@/components/settings/ai-secret-input";

export type ProviderFormState = {
  id?: string;
  version?: number | null;
  code: string;
  name: string;
  provider_type: "openai_compatible" | "openrouter";
  initial_provider_type?: "openai_compatible" | "openrouter";
  endpoint_url: string;
  api_key_setting_key: string;
  initial_api_key_setting_key?: string;
  api_key_setting_invalid?: boolean;
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
  primary_provider_id: string;
  primary_keyword: string;
  primary_option_value: string;
  fallback_model_id: string;
  fallback_provider_id: string;
  fallback_keyword: string;
  fallback_option_value: string;
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

  return {
    ...form,
    provider_type: "openrouter",
    api_key_setting_key: OPENROUTER_API_KEY_SETTING_KEY,
  };
}

export function providerFormFromRecord(item: AiProviderRecord): ProviderFormState {
  const providerType = item.provider_type === "openrouter" ? "openrouter" : "openai_compatible";
  const apiKeySettingKey = item.api_key_setting_key || "";
  const normalizedKey = isAiSecretSettingKey(apiKeySettingKey)
    && (providerType !== "openrouter" || apiKeySettingKey === OPENROUTER_API_KEY_SETTING_KEY)
    ? apiKeySettingKey : "";

  return {
    id: item.id,
    version: item.version ?? 1,
    code: item.code,
    name: item.name,
    provider_type: providerType,
    initial_provider_type: providerType,
    endpoint_url: item.endpoint_url || "",
    api_key_setting_key: normalizedKey,
    initial_api_key_setting_key: normalizedKey,
    api_key_setting_invalid: item.api_key_setting_invalid || Boolean(apiKeySettingKey && !normalizedKey),
    status: item.status,
    sort_order: String(item.sort_order ?? 0),
  };
}

export function providerReferencePatch(form: ProviderFormState): {
  provider_type?: ProviderFormState["provider_type"]; api_key_setting_key?: string | null;
} {
  return {
    ...(!form.id || form.provider_type !== form.initial_provider_type ? { provider_type: form.provider_type } : {}),
    ...(!form.id || form.api_key_setting_key !== form.initial_api_key_setting_key
      ? { api_key_setting_key: form.api_key_setting_key || null } : {}),
  };
}

export function providerKeyDisplay(value: string | null | undefined): string {
  if (!value) return "-";
  return isAiSecretSettingKey(value) ? value : "配置引用异常（已隐藏真实密钥或未知值）";
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

export function emptyRouteForm(providerId = ""): RouteFormState {
  return {
    scene_code: "",
    name: "",
    primary_model_id: "",
    primary_provider_id: providerId,
    primary_keyword: "",
    primary_option_value: "",
    fallback_model_id: NONE_VALUE,
    fallback_provider_id: providerId,
    fallback_keyword: "",
    fallback_option_value: NONE_VALUE,
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

export function routeModelOptionFromModel(model: AiModelRecord): AiRouteModelOptionRecord {
  return {
    source: "internal",
    value: model.id,
    model_id: model.id,
    provider_id: model.provider_id,
    label: model.name,
    description: model.model_name,
    modality: model.modality || "text",
    status: model.status,
  };
}
