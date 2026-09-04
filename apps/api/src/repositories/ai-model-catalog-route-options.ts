export type AiCatalogRouteModelEntryRecord = {
  id: string;
  provider_id: string;
  run_id: string;
  catalog_hash: string;
  external_model_id: string;
  model_code: string;
  model_name: string;
  modality: "text" | "image" | "video" | "speech";
  current_model_id: string | null;
  current_model_version?: number | null;
  apply_status: string | null;
};

export type AiCatalogRouteModelOptionRecord = {
  source: "catalog";
  value: string;
  model_id: string | null;
  provider_id: string;
  label: string;
  description: string | null;
  modality: "text" | "image" | "video" | "speech";
  apply_status: string | null;
};

export const CATALOG_ROUTE_ENTRY_SELECT = [
  "id",
  "provider_id",
  "run_id",
  "catalog_hash",
  "external_model_id",
  "model_code",
  "model_name",
  "modality",
  "current_model_id",
  "current_model_version",
  "apply_status",
].join(",");

export function catalogRouteModelOptionFromEntry(
  entry: AiCatalogRouteModelEntryRecord,
): AiCatalogRouteModelOptionRecord {
  return {
    source: "catalog",
    value: entry.id,
    model_id: entry.current_model_id,
    provider_id: entry.provider_id,
    label: entry.model_name,
    description: entry.external_model_id || null,
    modality: entry.modality,
    apply_status: entry.apply_status,
  };
}
