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
