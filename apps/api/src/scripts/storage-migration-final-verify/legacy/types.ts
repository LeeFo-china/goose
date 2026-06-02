export type CliOptions = {
  inputs: string[];
  limit: number;
  outDir: string;
};

export type MigrationItem = {
  tenant_id: string;
  source_table: string;
  source_id: string;
  source_field: string;
  array_index: string;
  legacy_value: string;
  object_key: string;
  target_object_key: string;
  migrated_status: string;
};

export type VerifyResult = MigrationItem & {
  object_key: string;
  verified_status: string;
  file_object_status: string;
  business_field_status: string;
  access_status: string;
  current_value: string;
  reason: string;
};

export type SourceConfig = {
  table: string;
  field: string;
  kind: "array" | "single" | "metadata";
  hasTenantId: boolean;
};
