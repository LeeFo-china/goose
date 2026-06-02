export type CliOptions = {
  input: string;
  limit: number;
  outDir: string;
  apply: boolean;
};

export type DryRunItem = {
  tenant_id: string;
  source_table: string;
  source_id: string;
  source_field: string;
  array_index: string;
  legacy_value: string;
  value_type: string;
  legacy_bucket: string;
  legacy_path: string;
  target_object_key: string;
  estimated_size_bytes: string;
  status: string;
  reason: string;
};

export type MigrationResult = DryRunItem & {
  migrated_status: string;
  file_id: string;
  provider: string;
  bucket: string;
  region: string;
  object_key: string;
  public_url: string;
  mime_type: string;
  size_bytes: string;
  checksum: string;
  access_url_http_status: string;
  migrated_reason: string;
};

export type CosConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicBaseUrl: string;
};
