export type AiProviderRecord = {
  id: string;
  code: string;
  name: string;
  provider_type: "openai_compatible" | "openrouter" | string;
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
  probe_status?: "unverified" | "eligible" | "ineligible" | "stale";
  version?: number | null;
  current_price_snapshot_id?: string | null;
  status: "active" | "inactive";
  sort_order: number;
  created_at: string;
  updated_at: string;
  provider?: AiProviderRecord | null;
};

export type AiSceneRouteRecord = {
  id: string;
  scene_code: string;
  name: string;
  primary_model_id: string | null;
  fallback_model_id: string | null;
  quality_tier?: "fast" | "balanced" | "quality";
  modality?: "text" | "image" | "video" | "speech";
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

export type AiConfigData = {
  counts?: {
    providers: number;
    models: number;
    routes: number;
  };
  credits?: {
    total_credits: number;
    total_usage: number;
  } | null;
  usage_summary?: {
    requests_24h: number;
    estimated_cost_usd_24h: number;
  };
  providers: AiProviderRecord[];
  models: AiModelRecord[];
  routes: AiSceneRouteRecord[];
};

export type PageData<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type AiCatalogRunRecord = {
  id: string;
  provider_id: string;
  source_endpoint: string;
  catalog_hash: string;
  run_status: "preview" | "applied" | "failed" | string;
  model_count: number;
  summary_payload: Record<string, unknown>;
  created_at: string;
};

export type AiCatalogEntryRecord = {
  id: string;
  run_id: string;
  entry_position: number;
  external_model_id: string;
  model_name: string;
  modality: "text" | "image" | "video" | "speech" | string;
  change_type: "new" | "changed" | "unchanged" | "removed" | string;
  current_model_id: string | null;
  current_model_version: number | null;
  raw_price_projection: Record<string, string | number | null> | null;
  catalog_hash: string;
};

export function statusLabel(status: string | null | undefined) {
  return status === "active" ? "启用" : "停用";
}
