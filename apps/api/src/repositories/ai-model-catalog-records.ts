export type AiProviderRecord = {
  id: string;
  code: string;
  name: string;
  provider_type: string;
  endpoint_url: string | null;
  api_key_setting_key: string | null;
  status: "active" | "inactive";
  sort_order: number;
  version?: number | null;
  created_at: string;
  updated_at: string;
};

export type AiModelRecord = {
  id: string;
  provider_id: string;
  code: string;
  name: string;
  model_name: string;
  modality?: "text" | "image" | "video" | "speech";
  input_modalities?: string[] | null;
  capability_payload?: Record<string, unknown> | null;
  probe_status?: "unverified" | "eligible" | "ineligible" | "stale";
  version?: number | null;
  current_price_snapshot_id?: string | null;
  catalog_managed?: boolean | null;
  status: "active" | "inactive";
  sort_order: number;
  created_at: string;
  updated_at: string;
  provider?: Pick<AiProviderRecord, "id" | "code" | "name" | "provider_type"> | null;
  price_snapshot?: Record<string, unknown> | null;
};

export type AiSceneRouteRecord = {
  id: string;
  scene_code: string;
  name: string;
  primary_model_id: string | null;
  fallback_model_id: string | null;
  quality_tier?: "fast" | "balanced" | "quality";
  modality?: "text" | "image" | "video" | "speech";
  max_cost_usd?: string | number | null;
  confirmation_threshold_usd?: string | number | null;
  temperature: number | null;
  response_format: "json_object" | "text" | null;
  timeout_ms: number | null;
  status: "active" | "inactive";
  version?: number | null;
  created_at: string;
  updated_at: string;
  primary_model?: AiModelRecord | null;
  fallback_model?: AiModelRecord | null;
};
