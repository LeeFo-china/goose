export type SystemSettingSource = "database" | "env" | "default" | "empty";
export type SystemSettingScope = "platform" | "tenant";
export type SystemSettingValueType = "string" | "number" | "boolean" | "json";

export type SystemSetting = {
  key: string;
  group_code: string;
  name: string;
  description: string | null;
  value_type: SystemSettingValueType;
  stored_value: string | null;
  effective_value: string | null;
  source: SystemSettingSource;
  effective_scope: SystemSettingScope;
  can_override_by_tenant: boolean;
  is_configured: boolean;
  is_secret: boolean;
  status: "active" | "inactive";
  updated_at: string;
};
