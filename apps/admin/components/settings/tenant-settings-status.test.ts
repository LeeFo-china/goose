import { describe, expect, test } from "bun:test";
import {
  countTenantGroupMissing,
  getTenantSmsProviderSettings,
} from "./tenant-settings-status";
import type {
  SystemSetting,
  SystemSettingSource,
} from "./settings-types";

function setting(
  key: string,
  source: SystemSettingSource,
  effectiveValue: string | null = null,
): SystemSetting {
  return {
    key,
    group_code: "sms",
    name: key,
    description: null,
    value_type: "string",
    stored_value: null,
    effective_value: effectiveValue,
    source,
    effective_scope: "tenant",
    can_override_by_tenant: true,
    is_configured: source !== "empty",
    is_secret: false,
    status: "active",
    updated_at: "2026-07-11T00:00:00.000Z",
  };
}

describe("tenant settings status", () => {
  test("does not count hidden provider fields when SMS inherits platform", () => {
    const settings = [
      setting("SMS_CHANNEL_MODE", "database", "platform"),
      setting("ALIBABA_CLOUD_ACCESS_KEY_ID", "empty"),
      setting("TENCENT_SMS_SECRET_ID", "empty"),
    ];

    expect(countTenantGroupMissing("sms", settings)).toBe(0);
  });

  test("counts only fields for the selected tenant SMS provider", () => {
    const settings = [
      setting("SMS_CHANNEL_MODE", "database", "tenant_aliyun"),
      setting("ALIBABA_CLOUD_ACCESS_KEY_ID", "empty"),
      setting("ALIYUN_SMS_SIGN_NAME", "database"),
      setting("TENCENT_SMS_SECRET_ID", "empty"),
    ];

    expect(countTenantGroupMissing("sms", settings)).toBe(1);
    expect(getTenantSmsProviderSettings(settings, "tenant_aliyun")).toHaveLength(
      2,
    );
  });

  test("requires the SMS mode setting itself when it is unavailable", () => {
    expect(countTenantGroupMissing("sms", [])).toBe(1);
  });

  test("keeps ordinary tenant group missing counts unchanged", () => {
    const settings = [
      setting("CUSTOMER_SERVICE_URL", "database"),
      setting("CUSTOMER_SERVICE_PHONE", "empty"),
    ];

    expect(countTenantGroupMissing("customer_service", settings)).toBe(1);
  });
});
