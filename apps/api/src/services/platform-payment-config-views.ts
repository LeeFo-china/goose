import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentProfileCode,
} from "@/repositories/platform-payment-configs";
import type { PlatformWechatPayProfileDefinition } from "@/services/platform-payment-readiness";

export type PlatformWechatPayConfigView = Omit<
  PlatformPaymentConfigRecord,
  | "serial_no"
  | "recharge_guard_version"
  | "encrypted_config_ref"
  | "secret_bundle_revision"
> & {
  serial_no_masked: string | null;
  has_encrypted_config_ref: boolean;
  has_secret_bundle_revision: boolean;
};

export type PlatformWechatPayConfigResult = {
  configured: boolean;
  can_manage: boolean;
  config: PlatformWechatPayConfigView | null;
};

export type PlatformWechatPayProfileView = {
  profile_code: PlatformPaymentProfileCode;
  label: string;
  description: string;
  configured: boolean;
  config: PlatformWechatPayConfigView | null;
};

export type PlatformWechatPayProfileListResult = {
  can_manage: boolean;
  profiles: PlatformWechatPayProfileView[];
};

export function toPlatformWechatPayConfigView(
  config: PlatformPaymentConfigRecord,
): PlatformWechatPayConfigView {
  const {
    serial_no: _serialNo,
    recharge_guard_version: _guardVersion,
    encrypted_config_ref: _encryptedConfigRef,
    secret_bundle_revision: _secretBundleRevision,
    ...safeConfig
  } = config;
  return {
    ...safeConfig,
    serial_no_masked: maskSerialNo(config.serial_no),
    has_encrypted_config_ref: Boolean(config.encrypted_config_ref),
    has_secret_bundle_revision: Boolean(config.secret_bundle_revision),
  };
}

export function toPlatformWechatPayProfileView(
  definition: PlatformWechatPayProfileDefinition,
  config: PlatformPaymentConfigRecord | null,
): PlatformWechatPayProfileView {
  return {
    profile_code: definition.profile_code,
    label: definition.label,
    description: definition.description,
    configured: Boolean(config),
    config: config ? toPlatformWechatPayConfigView(config) : null,
  };
}

function maskSerialNo(serialNo: string | null) {
  if (!serialNo) return null;
  if (serialNo.length <= 8) return "****";
  return `${serialNo.slice(0, 8)}****${serialNo.slice(-4)}`;
}
