import { describe, expect, test } from "bun:test";
import {
  UpdatePlatformWechatPayConfigSchema,
  UpdatePlatformWechatPaySecretBundleSchema,
} from "./platform-payment-configs";

describe("UpdatePlatformWechatPayConfigSchema", () => {
  test("keeps omitted profile and status fields undefined for partial updates", () => {
    const result = UpdatePlatformWechatPayConfigSchema.parse({
      enabled_channels: ["tenant_recharge"],
    });

    expect(result).toEqual({
      enabled_channels: ["tenant_recharge"],
    });
  });

  test("rejects plaintext wechat pay secrets", () => {
    const result = UpdatePlatformWechatPayConfigSchema.safeParse({
      merchant_mode: "direct_merchant",
      merchant_id: "1900000001",
      status: "pending",
      api_v3_key: "plaintext-secret",
      private_key: "plaintext-private-key",
    });

    expect(result.success).toBe(false);
  });

  test("accepts platform merchant display fields and secret reference", () => {
    const result = UpdatePlatformWechatPayConfigSchema.safeParse({
      merchant_mode: "direct_merchant",
      merchant_name: "好店平台微信商户",
      merchant_id: "1900000001",
      app_id: "wx-platform-app",
      encrypted_config_ref: "secret://platform/wechat-pay",
      serial_no: "1234567890abcdef",
      notify_url: "https://api.example.com/pay/wechat/callback",
      enabled_channels: ["tenant_recharge"],
      status: "active",
    });

    expect(result.success).toBe(true);
  });

  test("accepts service provider merchant fields for tenant payment profile", () => {
    const result = UpdatePlatformWechatPayConfigSchema.safeParse({
      merchant_mode: "service_provider_sub_merchant",
      merchant_name: "好店大数据服务商",
      merchant_id: "190000SP01",
      app_id: "wx-service-provider-app",
      sub_merchant_id: "1900000109",
      sub_app_id: "wx-sub-app",
      encrypted_config_ref:
        "setting://PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
      serial_no: "SERVICEPROVIDERSERIALNO",
      notify_url: "https://api.example.com/pay/wechat/callback",
      enabled_channels: ["project_payment", "applyment"],
      status: "active",
    });

    expect(result.success).toBe(true);
  });

  test("rejects unknown enabled channel", () => {
    const result = UpdatePlatformWechatPayConfigSchema.safeParse({
      merchant_mode: "direct_merchant",
      merchant_id: "1900000001",
      enabled_channels: ["unknown_channel"],
      status: "active",
    });

    expect(result.success).toBe(false);
  });
});

describe("UpdatePlatformWechatPaySecretBundleSchema", () => {
  test("accepts uploaded certificate and key text as secret bundle payload", () => {
    const result = UpdatePlatformWechatPaySecretBundleSchema.safeParse({
      private_key_pem: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
      api_v3_key: "12345678901234567890123456789012",
      wechat_pay_public_key_id: "PUB_KEY_ID_TEST",
      wechat_pay_public_key_pem: "-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----",
    });

    expect(result.success).toBe(true);
  });

  test("rejects incomplete secret bundle payload", () => {
    const result = UpdatePlatformWechatPaySecretBundleSchema.safeParse({
      private_key_pem: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    });

    expect(result.success).toBe(false);
  });
});
