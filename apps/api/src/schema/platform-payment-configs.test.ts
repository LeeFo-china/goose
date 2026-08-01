import { describe, expect, test } from "bun:test";
import {
  type PlatformWechatVirtualProductPatchInput,
  PlatformWechatVirtualEnvironmentSchema,
  PlatformWechatVirtualProductPatchSchema,
  PlatformWechatVirtualProductValidationSchema,
  UpdatePlatformWechatPayConfigSchema,
  UpdatePlatformWechatPaySecretBundleSchema,
  UpdatePlatformWechatVirtualMessageTokenSchema,
  UpdatePlatformWechatVirtualSecretBundleSchema,
  UpdatePlatformWechatVirtualSettingsSchema,
} from "./platform-payment-configs";

const validVirtualProduct = {
  environment: "sandbox",
  app_id: "wx-virtual-app",
  virtual_merchant_id: "virtual-merchant-1",
  offer_id: "offer-1",
  provider_product_id: "provider-product-1",
  expected_amount_fen: 9_900,
  secret_revision: 1,
  status: "active",
  version: 1,
} satisfies PlatformWechatVirtualProductPatchInput;

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

describe("PlatformWechatVirtualProductPatchSchema", () => {
  test("normalizes required text fields", () => {
    const result = PlatformWechatVirtualProductPatchSchema.parse({
      ...validVirtualProduct,
      app_id: "  wx-virtual-app  ",
      virtual_merchant_id: "  virtual-merchant-1  ",
      offer_id: "  offer-1  ",
      provider_product_id: "  provider-product-1  ",
    });

    expect(result).toEqual(validVirtualProduct);
  });

  test("accepts every supported environment", () => {
    expect(PlatformWechatVirtualEnvironmentSchema.parse("sandbox"))
      .toBe("sandbox");
    expect(PlatformWechatVirtualEnvironmentSchema.parse("production"))
      .toBe("production");
  });

  test("rejects an unsupported environment", () => {
    const result = PlatformWechatVirtualProductPatchSchema.safeParse({
      ...validVirtualProduct,
      environment: "staging",
    });

    expect(result.success).toBe(false);
  });

  test.each([
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["PostgreSQL integer overflow", 2_147_483_648],
  ])("rejects %s as expected amount", (_label, expectedAmountFen) => {
    const result = PlatformWechatVirtualProductPatchSchema.safeParse({
      ...validVirtualProduct,
      expected_amount_fen: expectedAmountFen,
    });

    expect(result.success).toBe(false);
  });

  test.each([
    ["secret_revision", { secret_revision: 0 }],
    ["version", { version: 0 }],
  ])("rejects zero %s", (_label, patch) => {
    const result = PlatformWechatVirtualProductPatchSchema.safeParse({
      ...validVirtualProduct,
      ...patch,
    });

    expect(result.success).toBe(false);
  });

  test("rejects encrypted secret references", () => {
    const result = PlatformWechatVirtualProductPatchSchema.safeParse({
      ...validVirtualProduct,
      encrypted_secret_ref: "secret://platform/wechat-virtual",
    });

    expect(result.success).toBe(false);
  });

  test("rejects unknown keys", () => {
    const result = PlatformWechatVirtualProductPatchSchema.safeParse({
      ...validVirtualProduct,
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });
});

describe("UpdatePlatformWechatVirtualSettingsSchema", () => {
  test.each(["direct_legacy", "maintenance", "wechat_virtual"])(
    "accepts %s purchase mode",
    (purchaseMode) => {
      expect(UpdatePlatformWechatVirtualSettingsSchema.safeParse({
        version: 1,
        purchase_mode: purchaseMode,
      }).success)
        .toBe(true);
    },
  );

  test("accepts and normalizes a virtual product update", () => {
    const result = UpdatePlatformWechatVirtualSettingsSchema.parse({
      version: 2,
      virtual_product: {
        ...validVirtualProduct,
        app_id: "  wx-virtual-app  ",
      },
    });

    expect(result).toEqual({
      version: 2,
      virtual_product: validVirtualProduct,
    });
  });

  test("rejects an update without a purchase mode or virtual product", () => {
    expect(UpdatePlatformWechatVirtualSettingsSchema.safeParse({ version: 1 })
      .success).toBe(false);
  });

  test.each([
    ["zero version", { version: 0, purchase_mode: "maintenance" }],
    ["unknown key", { version: 1, purchase_mode: "maintenance", extra: true }],
  ])("rejects %s", (_label, input) => {
    expect(UpdatePlatformWechatVirtualSettingsSchema.safeParse(input).success)
      .toBe(false);
  });
});

describe("PlatformWechatVirtualProductValidationSchema", () => {
  test("accepts a positive version", () => {
    expect(PlatformWechatVirtualProductValidationSchema.parse({ version: 1 }))
      .toEqual({ version: 1 });
  });

  test.each([
    ["zero version", { version: 0 }],
    ["unknown key", { version: 1, extra: true }],
  ])("rejects %s", (_label, input) => {
    expect(PlatformWechatVirtualProductValidationSchema.safeParse(input).success)
      .toBe(false);
  });
});

describe("UpdatePlatformWechatVirtualSecretBundleSchema", () => {
  test("normalizes the app key", () => {
    expect(UpdatePlatformWechatVirtualSecretBundleSchema.parse({
      app_key: "  app-secret  ",
      revision: 1,
    })).toEqual({ app_key: "app-secret", revision: 1 });
  });

  test.each([
    ["zero revision", { app_key: "app-secret", revision: 0 }],
    ["unknown key", { app_key: "app-secret", revision: 1, extra: true }],
  ])("rejects %s", (_label, input) => {
    expect(UpdatePlatformWechatVirtualSecretBundleSchema.safeParse(input).success)
      .toBe(false);
  });
});

describe("UpdatePlatformWechatVirtualMessageTokenSchema", () => {
  test("normalizes the message token", () => {
    expect(UpdatePlatformWechatVirtualMessageTokenSchema.parse({
      message_token: "  message-secret  ",
    })).toEqual({ message_token: "message-secret" });
  });

  test("rejects unknown keys", () => {
    const result = UpdatePlatformWechatVirtualMessageTokenSchema.safeParse({
      message_token: "message-secret",
      extra: true,
    });

    expect(result.success).toBe(false);
  });
});
