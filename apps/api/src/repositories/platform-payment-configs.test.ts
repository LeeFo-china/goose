import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformPaymentConfigRecord } from "./platform-payment-configs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const select = mock((_columns: string) => query);
const update = mock((_values: Record<string, unknown>) => query);
const eq = mock((_column: string, _value: unknown) => query);
const maybeSingle = mock(async (): Promise<{ data: unknown; error: unknown }> => ({
  data: null,
  error: null,
}));
const query = {
  select,
  update,
  eq,
  maybeSingle,
  single: maybeSingle,
};

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from: () => query }),
  },
}));

const baseConfig = {
  id: "config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-app",
  sub_app_id: null,
  encrypted_config_ref: "setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  serial_no: "SERIAL",
  notify_url: null,
  enabled_channels: [],
  status: "disabled",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-18T00:00:00.000Z",
  updated_at: "2026-07-18T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

describe("PlatformPaymentConfigRepository", () => {
  beforeEach(() => {
    select.mockClear();
    update.mockClear();
    eq.mockClear();
    maybeSingle.mockClear();
    maybeSingle.mockImplementation(async () => ({ data: null, error: null }));
  });

  test.each(["disabled", "suspended"] as const)(
    "loads a %s wechat config by immutable id without operational filters",
    async (status) => {
      const config = { ...baseConfig, status };
      maybeSingle.mockImplementationOnce(async () => ({ data: config, error: null }));
      const { platformPaymentConfigRepository } = await import(
        "./platform-payment-configs"
      );

      const result = await platformPaymentConfigRepository
        .findWechatPayConfigById("config-1");

      expect(select).toHaveBeenCalledWith("*");
      expect(eq.mock.calls).toEqual([["id", "config-1"]]);
      expect(result).toEqual(config);
    },
  );

  test("wraps by-id lookup database failures", async () => {
    maybeSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "database detail" },
    }));
    const { platformPaymentConfigRepository } = await import(
      "./platform-payment-configs"
    );

    await expect(
      platformPaymentConfigRepository.findWechatPayConfigById("config-1"),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "查询平台微信支付配置失败",
    });
  });

  test("persists sanitized validation evidence by immutable config id", async () => {
    const saved = {
      ...baseConfig,
      validation_status: "invalid" as const,
      last_validated_at: "2026-07-20T15:10:00.000Z",
      last_validation_error_code: "WECHAT_PAY_PROFILE_PROBE_REJECTED",
      last_validation_error_message: "微信支付配置验证失败，请检查配置后重试",
      last_validation_request_id: "wechat-request-id",
    };
    maybeSingle.mockImplementationOnce(async () => ({ data: saved, error: null }));
    const { platformPaymentConfigRepository } = await import(
      "./platform-payment-configs"
    );

    const result = await platformPaymentConfigRepository
      .updateWechatPayValidation({
        configId: "config-1",
        expectedUpdatedAt: "2026-07-18T00:00:00.000Z",
        validationStatus: "invalid",
        lastValidatedAt: "2026-07-20T15:10:00.000Z",
        lastValidationErrorCode: "WECHAT_PAY_PROFILE_PROBE_REJECTED",
        lastValidationErrorMessage: "微信支付配置验证失败，请检查配置后重试",
        lastValidationRequestId: "wechat-request-id",
        updatedByEmployeeId: "employee-platform",
      });

    expect(update).toHaveBeenCalledWith({
      validation_status: "invalid",
      last_validated_at: "2026-07-20T15:10:00.000Z",
      last_validation_error_code: "WECHAT_PAY_PROFILE_PROBE_REJECTED",
      last_validation_error_message: "微信支付配置验证失败，请检查配置后重试",
      last_validation_request_id: "wechat-request-id",
      updated_by_employee_id: "employee-platform",
    });
    expect(eq.mock.calls).toEqual([
      ["id", "config-1"],
      ["updated_at", "2026-07-18T00:00:00.000Z"],
    ]);
    expect(result).toEqual(saved);
  });

  test("rejects a stale validation write without changing the newer profile", async () => {
    maybeSingle.mockImplementationOnce(async () => ({ data: null, error: null }));
    const { platformPaymentConfigRepository } = await import(
      "./platform-payment-configs"
    );

    await expect(platformPaymentConfigRepository.updateWechatPayValidation({
      configId: "config-1",
      expectedUpdatedAt: "2026-07-18T00:00:00.000Z",
      validationStatus: "valid",
      lastValidatedAt: "2026-07-20T15:10:00.000Z",
      lastValidationErrorCode: null,
      lastValidationErrorMessage: null,
      lastValidationRequestId: "wechat-request-id",
      updatedByEmployeeId: "employee-platform",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PAYMENT_PROFILE_CHANGED",
      message: "支付配置已更新，请重新验证",
    });
    expect(eq.mock.calls).toEqual([
      ["id", "config-1"],
      ["updated_at", "2026-07-18T00:00:00.000Z"],
    ]);
  });
});
