import type { AiModelRecord } from "@/components/platform-ai/ai-config-types";
import { requestBackendJson } from "@/lib/backend-client";

export type ProviderFormState = {
  id?: string;
  code: string;
  name: string;
  endpoint_url: string;
  api_key_setting_key: string;
  status: "active" | "inactive";
  sort_order: string;
};

export type ModelFormState = {
  id?: string;
  provider_id: string;
  code: string;
  name: string;
  model_name: string;
  status: "active" | "inactive";
  sort_order: string;
};

export type RouteFormState = {
  id?: string;
  scene_code: string;
  name: string;
  primary_model_id: string;
  fallback_model_id: string;
  temperature: string;
  response_format: "json_object" | "text";
  timeout_ms: string;
  status: "active" | "inactive";
};

export const NONE_VALUE = "__none";

export function emptyProviderForm(): ProviderFormState {
  return {
    code: "",
    name: "",
    endpoint_url: "",
    api_key_setting_key: "",
    status: "active",
    sort_order: "0",
  };
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
