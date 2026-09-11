import { findSystemAiScene } from "@gooes/domain";
import type { AiSceneRouteRecord, AiSystemSceneRecord } from "./ai-config-types";
import { NONE_VALUE, type RouteFormState } from "./ai-model-routing-shared";

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
