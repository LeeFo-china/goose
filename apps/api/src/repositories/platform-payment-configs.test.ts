import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformPaymentConfigRecord } from "./platform-payment-configs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const select = mock((_columns: string) => query);
const eq = mock((_column: string, _value: unknown) => query);
const maybeSingle = mock(async (): Promise<{ data: unknown; error: unknown }> => ({
  data: null,
  error: null,
}));
const query = {
  select,
  eq,
  maybeSingle,
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
});
