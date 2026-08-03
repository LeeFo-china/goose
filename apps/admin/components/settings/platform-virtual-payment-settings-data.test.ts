import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import type {
  PlatformVirtualPaymentProductSummary,
  PlatformVirtualPaymentSettingsView,
} from "./platform-virtual-payment-settings-types";
import {
  buildVirtualChannelPatch,
  buildVirtualPaymentSettingsPatch,
  createVirtualChannelDraft,
} from "./platform-virtual-payment-settings-data";

const summary: PlatformVirtualPaymentProductSummary = {
  environment: "production",
  mapping: {
    environment: "production",
    app_id: "wx-app",
    virtual_merchant_id: "virtual-mch",
    offer_id: "offer",
    provider_product_id: "branding-annual",
    item_url: "https://cdn.example.test/branding.png",
    expected_amount_fen: 9_900,
    encrypted_secret_ref:
      "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    secret_revision: 3,
    status: "active",
    validation_status: "valid",
    validated_at: "2026-08-01T00:00:00.000Z",
    version: 2,
  },
  secret: {
    key: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    revision: 4,
    configured: true,
  },
};

type DeepKeys<T> = T extends readonly (infer Item)[]
  ? DeepKeys<Item>
  : T extends object
  ? keyof T | { [Key in keyof T]: DeepKeys<T[Key]> }[keyof T]
  : never;
type ForbiddenPlaintextKey =
  | "app_key"
  | "message_token_value"
  | "secret_value"
  | "plaintext";
type Assert<T extends true> = T;
type HasNoPlaintextLeafKeys = [Extract<
  DeepKeys<PlatformVirtualPaymentSettingsView>,
  ForbiddenPlaintextKey
>] extends [never] ? true : false;
const hasNoPlaintextLeafKeys: Assert<HasNoPlaintextLeafKeys> = true;

describe("platform virtual-payment settings data", () => {
  test("builds a channel request without product-owned fields", () => {
    const draft = createVirtualChannelDraft(summary.mapping);
    const result = buildVirtualChannelPatch({
      summary,
      draft: { ...draft, offerId: "new-offer", status: "active" },
    });

    expect(result).toEqual({
      ok: true,
      patch: {
        app_id: "wx-app",
        virtual_merchant_id: "virtual-mch",
        offer_id: "new-offer",
        secret_revision: 4,
        status: "active",
        version: 2,
      },
    });
    if (result.ok) {
      expect(Object.hasOwn(result.patch, "encrypted_secret_ref")).toBe(false);
      expect(Object.hasOwn(result.patch, "provider_product_id")).toBe(false);
      expect(Object.hasOwn(result.patch, "item_url")).toBe(false);
      expect(Object.hasOwn(result.patch, "expected_amount_fen")).toBe(false);
    }
  });

  test("keeps draft mappings disabled at payment-channel level", () => {
    const draft = createVirtualChannelDraft({
      ...summary.mapping!,
      status: "draft",
    });

    expect(draft.status).toBe("disabled");
  });

  test("keeps product CAS version and enforces forward-only mode transitions", () => {
    expect(buildVirtualPaymentSettingsPatch({
      currentMode: "maintenance",
      nextMode: "wechat_virtual",
      version: 7,
    })).toEqual({
      ok: true,
      patch: {
        version: 7,
        purchase_mode: "wechat_virtual",
      },
    });
    expect(buildVirtualPaymentSettingsPatch({
      currentMode: "direct_legacy",
      nextMode: "wechat_virtual",
      version: 7,
    })).toEqual({
      ok: false,
      message: "请先切换到维护模式并收敛旧待支付订单",
    });
    expect(buildVirtualPaymentSettingsPatch({
      currentMode: "wechat_virtual",
      nextMode: "direct_legacy",
      version: 7,
    })).toEqual({
      ok: false,
      message: "虚拟支付启用后只能暂停，不能回退到普通支付",
    });
    expect(buildVirtualPaymentSettingsPatch({
      currentMode: "maintenance",
      nextMode: "direct_legacy",
      version: 7,
    })).toEqual({
      ok: false,
      message: "不支持当前支付通道切换",
    });
  });

  test("models the safe GET response without plaintext secret fields", () => {
    const response: PlatformVirtualPaymentSettingsView = {
      product: {
        code: "custom_support_branding_annual",
        entitlement_code: "custom_support_branding",
        name: "年度品牌技术支持",
        amount_fen: 9_900,
        term_years: 1,
        purchase_notes: "支付后开通一年",
        enabled: true,
        purchase_mode: "maintenance",
        version: 7,
      },
      virtual_products: [summary],
      virtual_secret_sources: {
        sandbox: { configured: false, source: "default" },
        production: { configured: true, source: "database" },
      },
      message_auth: {
        message_token: {
          configured: true,
          source: "env",
          valid: true,
        },
        original_id: {
          configured: false,
          source: "empty",
          valid: false,
          settings_href: "/settings?group=wechat",
        },
      },
      readiness: {
        ready: false,
        blockers: [{
          code: "ORIGINAL_ID_MISSING",
          message: "请先配置小程序原始 ID",
          settings_href: "/settings?group=wechat",
        }],
      },
      can_manage: true,
    };
    expect(response.virtual_secret_sources.production.source).toBe("database");
    expect(hasNoPlaintextLeafKeys).toBe(true);
    expect(response.readiness.blockers[0]?.code).toBe("ORIGINAL_ID_MISSING");
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("app-key-must-never-leak");
    expect(serialized).not.toContain("message-token-must-never-leak");

    const source = readFileSync(
      new URL("./platform-virtual-payment-settings-types.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/\bapp_key\s*:\s*string/);
    expect(source).not.toMatch(/\bmessage_token_value\s*:/);
  });
});
