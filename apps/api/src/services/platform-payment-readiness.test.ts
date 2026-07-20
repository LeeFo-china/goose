import { describe, expect, mock, test } from "bun:test";
import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentProfileCode,
} from "@/repositories/platform-payment-configs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const directConfig = {
  id: "platform-config-direct",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform-app",
  sub_app_id: null,
  encrypted_config_ref: "setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  serial_no: "DIRECT-SERIAL-NUMBER",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: "2026-07-20T12:00:00.000Z",
  last_validation_error_code: null,
  last_validation_error_message: null,
  last_validation_request_id: "request-direct",
  risk_switches: {},
  recharge_guard_version: 2,
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-20T11:00:00.000Z",
  updated_at: "2026-07-20T12:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const serviceProviderConfig = {
  ...directConfig,
  id: "platform-config-service-provider",
  profile_code: "tenant_service_provider",
  merchant_mode: "service_provider_sub_merchant",
  merchant_name: "平台服务商",
  merchant_id: "1900000002",
  app_id: "wx-service-provider-app",
  encrypted_config_ref:
    "setting://PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
  serial_no: "SERVICE-PROVIDER-SERIAL-NUMBER",
  enabled_channels: ["project_payment", "applyment"],
  last_validated_at: "2026-07-20T12:05:00.000Z",
  last_validation_request_id: "request-service-provider",
} satisfies PlatformPaymentConfigRecord;

function createRepository(
  overrides: Partial<
    Record<PlatformPaymentProfileCode, PlatformPaymentConfigRecord | null>
  > = {},
) {
  const configs = {
    platform_direct_recharge: directConfig,
    tenant_service_provider: serviceProviderConfig,
    ...overrides,
  };
  return {
    findWechatPayConfigByProfile: mock(
      async (profileCode: PlatformPaymentProfileCode) => configs[profileCode],
    ),
  };
}

async function getReadiness(
  overrides: Partial<
    Record<PlatformPaymentProfileCode, PlatformPaymentConfigRecord | null>
  > = {},
) {
  const { PlatformPaymentReadinessService } = await import(
    "./platform-payment-readiness"
  );
  const repository = createRepository(overrides);
  const service = new PlatformPaymentReadinessService({ repository });
  return { result: await service.getReadiness(), repository };
}

describe("PlatformPaymentReadinessService", () => {
  test("returns exactly two secret-free ready profile summaries", async () => {
    const { result, repository } = await getReadiness();

    expect(result).toEqual({
      ready: true,
      profiles: [
        {
          profile_code: "platform_direct_recharge",
          label: "平台直连商户",
          ready: true,
          blockers: [],
          validation_status: "valid",
          last_validated_at: "2026-07-20T12:00:00.000Z",
          checks: {
            configured: true,
            active: true,
            validated: true,
            merchant_mode_matches: true,
            has_merchant_id: true,
            has_app_id: true,
            has_secret_ref: true,
            has_serial_no: true,
            has_callback: true,
            callback_is_https: true,
            required_channels_enabled: true,
          },
        },
        {
          profile_code: "tenant_service_provider",
          label: "服务商商户",
          ready: true,
          blockers: [],
          validation_status: "valid",
          last_validated_at: "2026-07-20T12:05:00.000Z",
          checks: {
            configured: true,
            active: true,
            validated: true,
            merchant_mode_matches: true,
            has_merchant_id: true,
            has_app_id: true,
            has_secret_ref: true,
            has_serial_no: true,
            has_callback: true,
            callback_is_https: true,
            required_channels_enabled: true,
          },
        },
      ],
    });
    expect(repository.findWechatPayConfigByProfile).toHaveBeenCalledTimes(2);

    const serialized = JSON.stringify(result);
    for (const secretValue of [
      directConfig.merchant_id,
      directConfig.app_id,
      directConfig.encrypted_config_ref,
      directConfig.serial_no,
      directConfig.last_validation_error_code,
      directConfig.last_validation_error_message,
      directConfig.last_validation_request_id,
    ]) {
      if (secretValue) expect(serialized).not.toContain(secretValue);
    }
  });

  test("reports a stable blocker when a bounded profile is not configured", async () => {
    const { result } = await getReadiness({
      tenant_service_provider: null,
    });

    expect(result.ready).toBe(false);
    expect(result.profiles[1]).toEqual({
      profile_code: "tenant_service_provider",
      label: "服务商商户",
      ready: false,
      blockers: [{
        code: "PLATFORM_PAYMENT_CONFIG_MISSING",
        message: "支付配置尚未创建",
      }],
      validation_status: null,
      last_validated_at: null,
      checks: {
        configured: false,
        active: false,
        validated: false,
        merchant_mode_matches: false,
        has_merchant_id: false,
        has_app_id: false,
        has_secret_ref: false,
        has_serial_no: false,
        has_callback: false,
        callback_is_https: false,
        required_channels_enabled: false,
      },
    });
  });

  test("reports all stored-metadata blockers without exposing their values", async () => {
    const broken = {
      ...directConfig,
      status: "pending",
      validation_status: "invalid",
      merchant_mode: "service_provider_sub_merchant",
      merchant_id: " ",
      app_id: null,
      encrypted_config_ref: "",
      serial_no: null,
      notify_url: null,
      enabled_channels: [],
      last_validation_error_code: "RAW_WECHAT_ERROR",
      last_validation_error_message: "raw upstream response",
      last_validation_request_id: "raw-request-id",
    } satisfies PlatformPaymentConfigRecord;
    const { result } = await getReadiness({
      platform_direct_recharge: broken,
    });
    const profile = result.profiles[0];

    expect(profile?.blockers.map((blocker) => blocker.code)).toEqual([
      "PLATFORM_PAYMENT_CONFIG_INACTIVE",
      "PLATFORM_PAYMENT_CONFIG_NOT_VALIDATED",
      "PLATFORM_PAYMENT_MERCHANT_MODE_MISMATCH",
      "PLATFORM_PAYMENT_MERCHANT_ID_MISSING",
      "PLATFORM_PAYMENT_APP_ID_MISSING",
      "PLATFORM_PAYMENT_SECRET_REF_MISSING",
      "PLATFORM_PAYMENT_SERIAL_NO_MISSING",
      "PLATFORM_PAYMENT_CALLBACK_URL_MISSING",
      "PLATFORM_PAYMENT_REQUIRED_CHANNELS_MISSING",
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("RAW_WECHAT_ERROR");
    expect(serialized).not.toContain("raw upstream response");
    expect(serialized).not.toContain("raw-request-id");
  });

  test("distinguishes a non-HTTPS callback from a missing callback", async () => {
    const { result } = await getReadiness({
      tenant_service_provider: {
        ...serviceProviderConfig,
        notify_url: "http://api.example.com/pay/wechat/callback",
      },
    });

    expect(result.profiles[1]?.blockers).toContainEqual({
      code: "PLATFORM_PAYMENT_CALLBACK_URL_NOT_HTTPS",
      message: "支付回调地址必须使用 HTTPS",
    });
    expect(result.profiles[1]?.checks.has_callback).toBe(true);
    expect(result.profiles[1]?.checks.callback_is_https).toBe(false);
  });

  test("requires both project payment and applyment channels for service provider", async () => {
    const { result } = await getReadiness({
      tenant_service_provider: {
        ...serviceProviderConfig,
        enabled_channels: ["project_payment"],
      },
    });

    expect(result.profiles[1]?.blockers).toContainEqual({
      code: "PLATFORM_PAYMENT_REQUIRED_CHANNELS_MISSING",
      message: "支付配置缺少必需的启用渠道",
    });
  });
});
