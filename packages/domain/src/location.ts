export type AdministrativeAreaLevel = "province" | "city" | "district";

export type AdministrativeAreaStatus = "active" | "inactive";

export type AdministrativeAreaNode = {
  adcode: string;
  name: string;
  level: AdministrativeAreaLevel;
  parent_adcode: string | null;
  full_name: string;
  source?: string | null;
  source_version?: string | null;
  sort_order?: number;
  status?: AdministrativeAreaStatus;
  children?: readonly AdministrativeAreaNode[];
};

export const PROPERTY_LOCATION_STATUS_VALUES = [
  'pending',
  'partial',
  'geocoded',
  'confirmed',
] as const;

export type PropertyLocationStatus =
  (typeof PROPERTY_LOCATION_STATUS_VALUES)[number];

export const PROPERTY_LOCATION_SOURCE_VALUES = [
  'manual',
  'tencent_geocoder',
  'tencent_reverse_geocoder',
  'backfill',
  'import',
] as const;

export type PropertyLocationSource =
  (typeof PROPERTY_LOCATION_SOURCE_VALUES)[number];
