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

  test("accepts safe display fields", () => {
    const result = UpdateWechatPayConfigSchema.safeParse({
      principal_type: "tenant",
      merchant_mode: "service_provider_sub_merchant",
      merchant_name: "固始晴天装饰微信商户",
      merchant_id: "1900000001",
      sub_merchant_id: "1900000002",
      app_id: "wx-app",
      sub_app_id: "wx-sub-app",
      applyment_business_code: "APPLY-20260701-001",
      applyment_id: "2000002124775691",
      applyment_state: "reviewing",
      applyment_state_message: "微信支付审核中",
      appid_binding_state: "pending_confirm",
      appid_binding_message: "等待小程序管理员确认",
      status: "pending",
      enabled_channels: ["project_payment"],
      settlement_account_summary: "招商银行 尾号 1234",
      serial_no: "1234567890abcdef",
      notify_url: "https://api.example.com/wechat-pay/notify",
    });

    expect(result.success).toBe(true);
  });

  test("rejects internal encrypted config references from tenant clients", () => {
    const result = UpdateWechatPayConfigSchema.safeParse({
      merchant_mode: "direct_merchant",
      status: "pending",
      encrypted_config_ref: "secret://tenant-1/wechat-pay",
    });

    expect(result.success).toBe(false);
  });

  test("rejects unknown onboarding states", () => {
    const result = UpdateWechatPayConfigSchema.safeParse({
      merchant_mode: "service_provider_sub_merchant",
      status: "pending",
      applyment_state: "waiting_for_magic",
      appid_binding_state: "almost_done",
    });

    expect(result.success).toBe(false);
  });

  test("does not default onboarding state when client omits it", () => {
    const result = UpdateWechatPayConfigSchema.safeParse({
      merchant_mode: "service_provider_sub_merchant",
      status: "pending",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.principal_type).toBeUndefined();
    expect(result.data.applyment_state).toBeUndefined();
    expect(result.data.appid_binding_state).toBeUndefined();
  });
});
