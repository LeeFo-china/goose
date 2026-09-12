import { z } from "zod";
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
  code?: string;
  name: string;
  model_name: string;
  modality: "text" | "image" | "video" | "speech";
  input_modalities: Array<"text" | "image" | "video" | "speech">;
  status: "active" | "inactive";
  sort_order: string;
};

export type ManualModelDraft = { enabled: boolean; name: string; model_name: string };
export type RouteFormState = {
  id?: string;
  version?: number | null;
  scene_code: string;
  scene_source: "registered" | "custom";
  custom_scene_name: string;
  custom_scene_modality: ModelFormState["modality"] | "";
  primary_manual: ManualModelDraft;
  fallback_manual: ManualModelDraft;
  name: string;
  primary_model_id: string;
  primary_provider_id: string;
  primary_keyword: string;
  primary_option_value: string;
  fallback_model_id: string;
  fallback_provider_id: string;
  fallback_keyword: string;
  fallback_option_value: string;
  quality_tier: "fast" | "balanced" | "quality" | "";
  modality: "text" | "image" | "video" | "speech";
  temperature: string;
  response_format: "json_object" | "text" | "";
  timeout_ms: string;
  status: "active" | "inactive";
};

export const NONE_VALUE = "__none";
export const OPENROUTER_API_KEY_SETTING_KEY = "OPENROUTER_API_KEY";

const SAFE_CONFIG_ERRORS: Readonly<Record<string, string>> = {
  AI_MODEL_ALREADY_REGISTERED: "同一供应商已登记相同调用名和模态的模型，请编辑已有模型。",
  AI_MODEL_MODALITY_IN_USE: "模型已被场景路由引用，请先调整引用后再修改模态。",
  AI_CONFIG_VERSION_STALE: "配置版本已更新，请加载最新配置后再保存。",
  AI_OPENROUTER_CATALOG_FAILED: "OpenRouter 目录读取失败，请检查密钥和连接地址后重试。",
  AI_OPENROUTER_CATALOG_INVALID: "OpenRouter 返回的目录格式无效，请稍后重试或联系供应商。",
  AI_PROVIDER_ENDPOINT_INVALID: "连接地址无效，请填写 HTTPS API 基础地址。",
  AI_PROVIDER_NOT_FOUND: "供应商不存在，请刷新列表并重新选择。",
  AI_PROVIDER_INACTIVE: "供应商已停用，请启用并保存后再验证。",
  AI_OPENROUTER_PROVIDER_INVALID: "接入协议不适用，请检查并保存供应商协议。",
  AI_OPENROUTER_API_KEY_MISSING: "尚未配置密钥，请先配置密钥再验证。",
  AI_SECRET_SETTING_INVALID: "密钥配置引用异常，请重新选择有效配置或联系管理员。",
  VALIDATION_ERROR: "配置参数无效，请检查名称、连接地址、密钥引用和模态。",
  FORBIDDEN: "没有执行此操作的权限，请联系管理员。",
};
export function aiConfigErrorFeedback(error: unknown, fallback: string): { message: string; stale: boolean } {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "";
  return { message: Object.hasOwn(SAFE_CONFIG_ERRORS, code) ? SAFE_CONFIG_ERRORS[code] : fallback, stale: code === "AI_CONFIG_VERSION_STALE" };
}

interface AiFocusTarget { isConnected: boolean; disabled?: boolean; focus: () => void }
export function resolveAiFocusTarget(trigger: AiFocusTarget | null, fallback: AiFocusTarget | null): AiFocusTarget | null {
  if (trigger?.isConnected && !trigger.disabled) return trigger;
  return fallback?.isConnected && !fallback.disabled ? fallback : null;
}

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

export function mergeProviderRecords(current: AiProviderRecord[], incoming: AiProviderRecord[]): AiProviderRecord[] {
  return [...new Map([...current, ...incoming].map((provider) => [provider.id, provider])).values()];
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
    name: "",
    model_name: "",
    modality: "text",
    input_modalities: ["text"],
    status: "active",
    sort_order: "0",
  };
}

export const MODEL_MODALITIES = ["text", "image", "video", "speech"] as const;
export const MODEL_MODALITY_LABELS = { text: "文本", image: "图片", video: "视频", speech: "语音" };
const modelPayloadSchema = z.object({
  provider_id: z.uuid(), name: z.string().trim().min(1).max(120),
  model_name: z.string().trim().min(1).max(200), modality: z.enum(MODEL_MODALITIES),
  input_modalities: z.array(z.enum(MODEL_MODALITIES)).min(1).max(4),
  status: z.enum(["active", "inactive"]), sort_order: z.coerce.number().int().min(0).max(100000),
  expected_version: z.number().int().min(1).optional(),
});

export function modelPayload(form: ModelFormState): z.infer<typeof modelPayloadSchema> {
  return modelPayloadSchema.parse({
    provider_id: form.provider_id, name: form.name, model_name: form.model_name,
    modality: form.modality, input_modalities: [...new Set(form.input_modalities)],
    status: form.status, sort_order: form.sort_order,
    ...(form.id ? { expected_version: form.version ?? 1 } : {}),
  });
}

export function modelFormFromRecord(model: AiModelRecord): ModelFormState {
  const inputs = MODEL_MODALITIES.filter((modality) => model.input_modalities?.includes(modality));
  return {
    id: model.id, version: model.version, provider_id: model.provider_id, code: model.code,
    name: model.name, model_name: model.model_name, modality: model.modality || "text",
    input_modalities: inputs.length ? inputs : ["text"], status: model.status,
    sort_order: String(model.sort_order),
  };
}

export function emptyRouteForm(providerId = ""): RouteFormState {
  return {
    scene_source: "registered",
    custom_scene_name: "",
    custom_scene_modality: "",
    primary_manual: { enabled: false, name: "", model_name: "" },
    fallback_manual: { enabled: false, name: "", model_name: "" },
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
