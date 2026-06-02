import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { systemSettingRepository, type SystemSettingRecord } from "@/repositories/system-settings";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export type SettingDefinition = {
  key: string;
  groupCode: string;
  name: string;
  description: string;
  valueType: "string" | "number" | "boolean" | "json";
  envNames: string[];
  defaultValue?: string;
  isSecret?: boolean;
};

export type SettingSource = "database" | "env" | "default" | "empty";
export type SettingScope = "platform" | "tenant";

export type EffectiveSetting = SystemSettingRecord & {
  effective_value: string | null;
  stored_value: string | null;
  source: SettingSource;
  is_configured: boolean;
  effective_scope: SettingScope;
  can_override_by_tenant: boolean;
};

export const CACHE_TTL_MS = 30 * 1000;
export const ENCRYPTED_VALUE_PREFIX = "enc:v1:";


export {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  Errors,
  systemSettingRepository,
  accessPolicyService,
};
export type { SystemSettingRecord, AuthContext };
