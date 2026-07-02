import { describe, expect, test } from "bun:test";
import { UpdatePlatformWechatPayConfigSchema } from "./platform-payment-configs";

describe("UpdatePlatformWechatPayConfigSchema", () => {
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

  test("rejects project payment channel for platform config", () => {
    const result = UpdatePlatformWechatPayConfigSchema.safeParse({
      merchant_mode: "direct_merchant",
      merchant_id: "1900000001",
      enabled_channels: ["project_payment"],
      status: "active",
    });

    expect(result.success).toBe(false);
  });
});
