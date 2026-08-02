import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import type {
  PlatformVirtualPaymentProductSummary,
  PlatformVirtualPaymentSettingsView,
} from "./platform-virtual-payment-settings-types";
import {
  buildVirtualMappingPatch,
  buildVirtualPaymentSettingsPatch,
  createVirtualMappingDraft,
  parseVirtualPaymentAmountInput,
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
  test("reuses exact yuan-to-fen parsing and rejects unsupported prices", () => {
    expect(parseVirtualPaymentAmountInput("99.00")).toEqual({
      ok: true,
      amountFen: 9_900,
    });
    expect(parseVirtualPaymentAmountInput("99.001")).toEqual({
      ok: false,
      message: "年度价格最多保留两位小数",
    });
    expect(parseVirtualPaymentAmountInput("21474836.48")).toEqual({
      ok: false,
      message: "年度价格超出支持范围",
    });
  });

  test("builds a mapping request without accepting a client secret reference", () => {
    const draft = createVirtualMappingDraft(summary.mapping);
    const result = buildVirtualMappingPatch({
      summary,
      draft: { ...draft, offerId: "new-offer", status: "active" },
      amountYuan: "99.00",
    });

    expect(result).toEqual({
      ok: true,
      patch: {
        environment: "production",
        app_id: "wx-app",
        virtual_merchant_id: "virtual-mch",
        offer_id: "new-offer",
        provider_product_id: "branding-annual",
        item_url: "https://cdn.example.test/branding.png",
        expected_amount_fen: 9_900,
        secret_revision: 4,
        status: "draft",
        version: 2,
      },
    });
    if (result.ok) {
      expect(Object.hasOwn(result.patch, "encrypted_secret_ref")).toBe(false);
      expect(result.patch.secret_revision).toBe(4);
    }
  });

  test("requires a stable HTTPS JPG or PNG item URL", () => {
    const draft = createVirtualMappingDraft(summary.mapping);
    expect(buildVirtualMappingPatch({
      summary,
      draft: { ...draft, itemUrl: " https://cdn.example.test/goods.jpg?v=2 " },
      amountYuan: "99.00",
    })).toMatchObject({
      ok: true,
      patch: { item_url: "https://cdn.example.test/goods.jpg?v=2" },
    });

    for (const itemUrl of [
      "",
      "http://cdn.example.test/goods.png",
      "https://cdn.example.test/goods.webp",
      "https://cdn.example.test/goods.png#fragment",
    ]) {
      expect(buildVirtualMappingPatch({
        summary,
        draft: { ...draft, itemUrl },
        amountYuan: "99.00",
      })).toEqual({
        ok: false,
        message: "商品图片必须是稳定的 HTTPS JPG 或 PNG 地址",
      });
    }
  });

  test("requires revalidation before activating an unvalidated mapping", () => {
    const result = buildVirtualMappingPatch({
      summary: {
        ...summary,
        secret: { ...summary.secret, revision: 3 },
        mapping: {
          ...summary.mapping!,
          status: "draft",
          validation_status: "pending",
        },
      },
      draft: {
        ...createVirtualMappingDraft(summary.mapping),
        status: "active",
      },
      amountYuan: "99.00",
    });

    expect(result).toEqual({
      ok: false,
      message: "请先校验当前环境的虚拟商品映射",
    });
  });

  test("keeps product CAS version and enforces forward-only mode transitions", () => {
    const mappingResult = buildVirtualMappingPatch({
      summary,
      draft: createVirtualMappingDraft(summary.mapping),
      amountYuan: "99.00",
    });
    if (!mappingResult.ok) throw new Error(mappingResult.message);

    expect(buildVirtualPaymentSettingsPatch({
      currentMode: "maintenance",
      nextMode: "wechat_virtual",
      version: 7,
      virtualProduct: mappingResult.patch,
    })).toEqual({
      ok: true,
      patch: {
        version: 7,
        purchase_mode: "wechat_virtual",
        virtual_product: mappingResult.patch,
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
