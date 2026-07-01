import { describe, expect, test } from "bun:test";
import { UpdateWechatPayConfigSchema } from "./wechat-pay-configs";

describe("UpdateWechatPayConfigSchema", () => {
  test("rejects plaintext wechat pay secrets", () => {
    const result = UpdateWechatPayConfigSchema.safeParse({
      merchant_mode: "direct_merchant",
      merchant_id: "1900000001",
      status: "pending",
      api_v3_key: "plaintext-secret",
    });

    expect(result.success).toBe(false);
  });

  test("accepts safe display fields and encrypted config reference", () => {
    const result = UpdateWechatPayConfigSchema.safeParse({
      merchant_mode: "service_provider_sub_merchant",
      merchant_name: "固始晴天装饰微信商户",
      merchant_id: "1900000001",
      sub_merchant_id: "1900000002",
      app_id: "wx-app",
      sub_app_id: "wx-sub-app",
      status: "pending",
      enabled_channels: ["project_payment"],
      settlement_account_summary: "招商银行 尾号 1234",
      encrypted_config_ref: "secret://tenant-1/wechat-pay",
      serial_no: "1234567890abcdef",
      notify_url: "https://api.example.com/wechat-pay/notify",
    });

    expect(result.success).toBe(true);
  });
});
