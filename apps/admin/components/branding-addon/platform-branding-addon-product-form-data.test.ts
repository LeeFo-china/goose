import { describe, expect, test } from "bun:test";

import {
  buildModePatch,
  buildProductPatch,
  createProductFormValues,
  formatFenAsYuanInput,
  isOrderRefundable,
  parseYuanInputToFen,
  ProductFormValidationError,
} from "./platform-branding-addon-product-form-data";
import type { PlatformBrandingAddonProduct } from "./platform-branding-addon-product-types";

const product: PlatformBrandingAddonProduct = {
  code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  name: "年度品牌技术支持",
  amount_fen: 1,
  term_years: 1,
  purchase_notes: "支付成功后自动开通或续期一年",
  enabled: true,
  purchase_mode: "direct_legacy",
  version: 2,
};

function expectValidationError(
  callback: () => unknown,
  field: ProductFormValidationError["field"],
  message: string,
) {
  try {
    callback();
    throw new Error("expected validation error");
  } catch (error) {
    expect(error).toBeInstanceOf(ProductFormValidationError);
    expect((error as ProductFormValidationError).field).toBe(field);
    expect((error as Error).message).toBe(message);
  }
}

describe("platform branding addon product form data", () => {
  test("requires maintenance before switching to virtual payment", () => {
    expect(buildModePatch({
      current: "direct_legacy",
      next: "wechat_virtual",
      version: 3,
    })).toEqual({
      ok: false,
      message: "请先切换到维护模式并收敛旧待支付订单",
    });

    expect(buildModePatch({
      current: "direct_legacy",
      next: "maintenance",
      version: 3,
    })).toEqual({
      ok: true,
      patch: { purchase_mode: "maintenance", version: 3 },
    });
  });

  test("allows virtual payment to pause but never fall back to direct payment", () => {
    expect(buildModePatch({
      current: "wechat_virtual",
      next: "maintenance",
      version: 4,
    })).toEqual({
      ok: true,
      patch: { purchase_mode: "maintenance", version: 4 },
    });
    expect(buildModePatch({
      current: "wechat_virtual",
      next: "direct_legacy",
      version: 4,
    })).toEqual({
      ok: false,
      message: "虚拟支付启用后只能暂停，不能回退到普通支付",
    });
  });

  test("enables refunds only for fulfilled successful virtual orders", () => {
    expect(isOrderRefundable({
      payment_channel: "wechat_virtual",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
    })).toBe(true);
    expect(isOrderRefundable({
      payment_channel: "legacy_direct",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
    })).toBe(false);
    expect(isOrderRefundable({
      payment_channel: "wechat_virtual",
      payment_status: "succeeded",
      fulfillment_status: "grant_failed",
      refund_status: "none",
    })).toBe(false);
  });

  test("formats integer fen as an exact yuan input value", () => {
    expect(formatFenAsYuanInput(null)).toBe("");
    expect(formatFenAsYuanInput(1)).toBe("0.01");
    expect(formatFenAsYuanInput(12_345)).toBe("123.45");
  });

  test("creates editable form values from a product response", () => {
    expect(createProductFormValues(product)).toEqual({
      name: "年度品牌技术支持",
      amountYuan: "0.01",
      purchaseNotes: "支付成功后自动开通或续期一年",
      enabled: true,
    });
  });

  test("parses yuan input without floating-point rounding", () => {
    expect(parseYuanInputToFen("0.01")).toEqual({
      ok: true,
      amountFen: 1,
    });
    expect(parseYuanInputToFen("99")).toEqual({
      ok: true,
      amountFen: 9_900,
    });
    expect(parseYuanInputToFen("21474836.47")).toEqual({
      ok: true,
      amountFen: 2_147_483_647,
    });
  });

  test("rejects empty, over-precision, non-positive, and out-of-range prices", () => {
    expect(parseYuanInputToFen("")).toEqual({
      ok: false,
      message: "请填写年度价格",
    });
    expect(parseYuanInputToFen("1.001")).toEqual({
      ok: false,
      message: "年度价格最多保留两位小数",
    });
    expect(parseYuanInputToFen("0")).toEqual({
      ok: false,
      message: "年度价格必须大于 0 元",
    });
    expect(parseYuanInputToFen("21474836.48")).toEqual({
      ok: false,
      message: "年度价格超出支持范围",
    });
    expect(parseYuanInputToFen("一元")).toEqual({
      ok: false,
      message: "年度价格格式不正确",
    });
  });

  test("builds the patch with trimmed fields and the current version", () => {
    const patch = buildProductPatch(product, {
      name: "  年度品牌技术支持  ",
      amountYuan: "99.00",
      purchaseNotes: "  支付成功后自动开通或续期一年  ",
      enabled: true,
    });
    expect(patch).toEqual({
      name: "年度品牌技术支持",
      amount_fen: 9_900,
      purchase_notes: "支付成功后自动开通或续期一年",
      enabled: true,
      version: 2,
    });
    expect(Object.hasOwn(patch, "purchase_mode")).toBe(false);
    expect(Object.hasOwn(patch, "virtual_product")).toBe(false);
  });

  test("allows an unconfigured disabled product to save without a price", () => {
    expect(
      buildProductPatch(
        { ...product, amount_fen: null, enabled: false },
        {
          name: "年度品牌技术支持",
          amountYuan: "",
          purchaseNotes: "开通一年",
          enabled: false,
        },
      ),
    ).toEqual({
      name: "年度品牌技术支持",
      purchase_notes: "开通一年",
      enabled: false,
      version: 2,
    });
  });

  test("requires a configured price before enabling the product", () => {
    expectValidationError(
      () =>
      buildProductPatch(
        { ...product, amount_fen: null, enabled: false },
        {
          name: "年度品牌技术支持",
          amountYuan: "",
          purchaseNotes: "开通一年",
          enabled: true,
        },
      ),
      "amountYuan",
      "请填写年度价格",
    );
  });

  test("returns field-specific validation errors before building a patch", () => {
    expectValidationError(
      () =>
      buildProductPatch(product, {
        name: " ",
        amountYuan: "1.00",
        purchaseNotes: "开通一年",
        enabled: true,
      }),
      "name",
      "请填写商品名称",
    );

    expectValidationError(
      () =>
      buildProductPatch(product, {
        name: "年度品牌技术支持",
        amountYuan: "1.00",
        purchaseNotes: " ",
        enabled: true,
      }),
      "purchaseNotes",
      "请填写购买说明",
    );

    expectValidationError(
      () =>
      buildProductPatch(product, {
        name: "品".repeat(101),
        amountYuan: "1.00",
        purchaseNotes: "开通一年",
        enabled: true,
      }),
      "name",
      "商品名称不能超过 100 个字符",
    );

    expectValidationError(
      () =>
      buildProductPatch(product, {
        name: "年度品牌技术支持",
        amountYuan: "1.00",
        purchaseNotes: "说".repeat(501),
        enabled: true,
      }),
      "purchaseNotes",
      "购买说明不能超过 500 个字符",
    );
  });
});
