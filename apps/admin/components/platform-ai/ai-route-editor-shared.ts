import { findSystemAiScene } from "@gooes/domain";
import type { AiSceneRouteRecord, AiSystemSceneRecord } from "./ai-config-types";
import { NONE_VALUE, type RouteFormState } from "./ai-model-routing-shared";
import type { RouteModelTarget } from "./ai-route-model-selector";

export function routeModality(form: RouteFormState): RouteFormState["modality"] {
  return form.scene_source === "custom" ? form.custom_scene_modality || form.modality : form.modality;
}
export function routeIdentity(form: RouteFormState) {
  return form.scene_source === "custom"
    ? { scene_source: "custom", scene_name: form.custom_scene_name.trim(), modality: form.custom_scene_modality }
    : { scene_source: "registered", scene_code: form.scene_code };
}
export function routeValidation(form: RouteFormState, scene: AiSystemSceneRecord | null): string | null {
  if (form.scene_source === "custom") {
    if (!form.custom_scene_name.trim()) return "请填写自定义场景名称。";
    if (!form.custom_scene_modality) return "请选择自定义场景模态。";
  } else if (!scene || (!form.id && !scene.allow_new_configuration) || scene.status === "inactive") {
    return "请选择可配置的业务场景。";
  }
  for (const target of ["primary", "fallback"] as const) {
    if (form[`${target}_manual`].enabled && !form[`${target}_manual`].model_name.trim()) return `请填写${target === "primary" ? "主模型" : "备用模型"}调用名称。`;
  }
  return null;
}
export function manualModelPayload(form: RouteFormState, target: RouteModelTarget, scene: AiSystemSceneRecord | null) {
  const draft = form[`${target}_manual`];
  if (!draft.enabled) return null;
  const modality = routeModality(form);
  const modelName = draft.model_name.trim();
  return { source: "manual" as const, name: draft.name.trim() || modelName, model_name: modelName,
    modality, input_modalities: form.scene_source === "custom" ? [modality] : scene?.required_input_modalities ?? [modality] };
}
export function routeMutablePayload(form: RouteFormState, models: Array<string | null>) {
  return {
    ...(form.scene_source === "registered" && form.name.trim() ? { name: form.name.trim() } : {}),
    primary_model_id: models[0], fallback_model_id: models[1],
    temperature: form.temperature ? Number(form.temperature) : null,
    timeout_ms: form.timeout_ms ? Number(form.timeout_ms) : null, status: form.status,
    ...(form.quality_tier ? { quality_tier: form.quality_tier } : {}),
    ...(routeModality(form) === "text" && form.response_format ? { response_format: form.response_format } : {}),
  };
}
export function sceneQueryPath(page = 1, keyword = ""): string {
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (keyword.trim()) query.set("keyword", keyword.trim());
  return `/platform/ai-config/scenes?${query}`;
}
export function mergeSceneOptions<T extends { code: string }>(current: T[], incoming: T[]): T[] {
  return [...new Map([...current, ...incoming].map((item) => [item.code, item])).values()];
}
export function sceneDeleteConfirmed(response: unknown, code: string): boolean {
  return Boolean(response && typeof response === "object" && "code" in response && response.code === code
    && "deleted" in response && response.deleted === true);
}

export function sceneFromRoute(item: AiSceneRouteRecord): AiSystemSceneRecord {
  const systemScene = findSystemAiScene(item.scene_code);
  if (systemScene) return {
    ...systemScene, required_input_modalities: [...systemScene.required_input_modalities],
    source: "system", allow_new_configuration: true,
  };
  return {
    code: item.scene_code, name: item.name, modality: item.modality || "text",
    required_input_modalities: ["text"],
    runtime_status: "connected", requirements_source: "runtime",
    requires_streaming: false, min_reference_images: 0,
    source: "legacy", allow_new_configuration: false,
  };
}

export function routeFormFromRecord(item: AiSceneRouteRecord, providerId: string): RouteFormState {
  const primaryProviderId = item.primary_model?.provider_id || providerId;
  return {
    scene_source: "registered", custom_scene_name: "", custom_scene_modality: "",
    primary_manual: { enabled: false, name: "", model_name: "" },
    fallback_manual: { enabled: false, name: "", model_name: "" },
    id: item.id,
    version: item.version ?? 1,
    scene_code: item.scene_code,
    name: item.name,
    primary_model_id: item.primary_model_id || "",
    primary_provider_id: primaryProviderId,
    primary_keyword: "",
    primary_option_value: item.primary_model_id || "",
    fallback_model_id: item.fallback_model_id || NONE_VALUE,
    fallback_provider_id: item.fallback_model?.provider_id || primaryProviderId,
    fallback_keyword: "",
    fallback_option_value: item.fallback_model_id || NONE_VALUE,
    quality_tier: item.quality_tier || "",
    modality: item.modality || "text",
    temperature: item.temperature == null ? "" : String(item.temperature),
    response_format: item.response_format || "",
    timeout_ms: item.timeout_ms == null ? "" : String(item.timeout_ms),
    status: item.status,
  };
}
