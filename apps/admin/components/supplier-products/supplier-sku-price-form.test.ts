import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  buildPurchasableSkuPath,
  loadSupplierSkuCurrentPrice,
  loadSupplierSkuPriceDefaults,
} from "./supplier-product-api";
import {
  buildPurchasableSkuCreatePayload,
  buildPurchasableSkuUpdatePayload,
  canUseInlineSkuPrice,
  createInitialSkuPriceForm,
  getSupplierSkuPriceEffectiveUntilNotice,
  getSupplierSkuSaveMode,
  getSupplierSkuTaxRateOptions,
  isSupplierSkuPriceFormValid,
} from "./supplier-sku-price-form";
import type {
  ProductApiScope,
  SupplierSkuPriceContext,
} from "./supplier-product-types";

const tenantScope: ProductApiScope = {
  kind: "tenant",
  tenantSupplierId: "relationship-1",
};
const platformScope: ProductApiScope = {
  kind: "platform",
  supplierId: "supplier-1",
};
const permissions = {
  canManageProducts: true,
  canViewCostPrice: true,
  canManageCostPrice: true,
};
const originalFetch = globalThis.fetch;
const currentPrice = {
  supplier_price_list_id: "price-list-1",
  supplier_price_list_version: 7,
  supplier_price_list_row_version: 5,
  supplier_price_list_item_id: "price-item-1",
  unit_price: "318.00",
  tax_rate: "0.075000",
  tax_inclusive: true,
  effective_from: "2026-09-01T08:00:00+08:00",
  effective_until: null,
} as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function priceContext(
  overrides: Partial<SupplierSkuPriceContext> = {},
): SupplierSkuPriceContext {
  return {
    currency: "CNY",
    recommended_tax_rate: "0.13",
    recommended_tax_inclusive: false,
    next_scheduled_effective_from: null,
    current_price: null,
    ...overrides,
  };
}

describe("供应商 SKU 即时价格模型", () => {
  test("没有当前价格时精确使用空单价和推荐税率默认值", () => {
    expect(createInitialSkuPriceForm(priceContext())).toEqual({
      unitPrice: "",
      taxRate: "0.13",
      taxInclusive: false,
    });
  });

  test("有当前价格时保留数据库返回的历史字符串值", () => {
    expect(createInitialSkuPriceForm(priceContext({ current_price: currentPrice })))
      .toEqual({
        unitPrice: "318.00",
        taxRate: "0.075000",
        taxInclusive: true,
      });
  });

  test("创建 payload 原样提交价格字符串", () => {
    expect(buildPurchasableSkuCreatePayload({
      sku: {
        name: "18L",
        purchase_unit_id: "unit-1",
        specification: "18L",
        model: null,
        batch_managed: false,
        color_managed: false,
        serial_managed: false,
        spec_values: {},
      },
      priceForm: {
        unitPrice: "318.00",
        taxRate: "0.130000",
        taxInclusive: false,
      },
    })).toEqual({
      sku: {
        name: "18L",
        purchase_unit_id: "unit-1",
        specification: "18L",
        model: null,
        batch_managed: false,
        color_managed: false,
        serial_managed: false,
        spec_values: {},
      },
      price: {
        unit_price: "318.00",
        tax_rate: "0.130000",
        tax_inclusive: false,
      },
    });
  });

  test("更新 payload 使用 SKU 版本和当前价格簿行版本", () => {
    expect(buildPurchasableSkuUpdatePayload({
      sku: { expectedVersion: 3, name: "18L" },
      priceForm: {
        unitPrice: "318.00",
        taxRate: "0.13",
        taxInclusive: false,
      },
      context: priceContext({ current_price: currentPrice }),
    })).toEqual({
      sku: { expected_version: 3, name: "18L" },
      price: {
        unit_price: "318.00",
        tax_rate: "0.13",
        tax_inclusive: false,
        expected_price_list_id: "price-list-1",
        expected_price_list_version: 5,
      },
    });
  });

  test("没有当前价格的更新显式提交空价格簿并发标识", () => {
    expect(buildPurchasableSkuUpdatePayload({
      sku: { expectedVersion: 4 },
      priceForm: {
        unitPrice: "20.00",
        taxRate: "0",
        taxInclusive: false,
      },
      context: priceContext(),
    }).price).toEqual({
      unit_price: "20.00",
      tax_rate: "0",
      tax_inclusive: false,
      expected_price_list_id: null,
      expected_price_list_version: null,
    });
  });

  test("更新 payload 忽略采购单位、状态和其他未知字段", () => {
    const payload = buildPurchasableSkuUpdatePayload({
      sku: {
        expectedVersion: 4,
        name: "18L",
        purchase_unit_id: "unwanted-unit",
        status: "active",
        unknown: "value",
      },
      priceForm: {
        unitPrice: "20.00",
        taxRate: "0.13",
        taxInclusive: false,
      },
      context: priceContext(),
    } as Parameters<typeof buildPurchasableSkuUpdatePayload>[0] & {
      sku: Record<string, unknown>;
    });

    expect(payload.sku).toEqual({ expected_version: 4, name: "18L" });
    expect(payload.sku).not.toHaveProperty("purchase_unit_id");
    expect(payload.sku).not.toHaveProperty("status");
  });

  test.each([
    ["零单价", "0", "0.13"],
    ["负单价", "-1", "0.13"],
    ["科学计数单价", "1e2", "0.13"],
    ["三位小数单价", "1.001", "0.13"],
    ["负税率", "1.00", "-0.1"],
    ["税率超过一", "1.00", "1.000001"],
    ["七位小数税率", "1.00", "0.1234567"],
    ["科学计数税率", "1.00", "1e-1"],
  ])("拒绝%s", (_label, unitPrice, taxRate) => {
    expect(isSupplierSkuPriceFormValid({
      unitPrice,
      taxRate,
      taxInclusive: false,
    })).toBe(false);
  });

  test("接受 API 支持的字符串小数边界", () => {
    expect(isSupplierSkuPriceFormValid({
      unitPrice: "999999999999.99",
      taxRate: "1.000000",
      taxInclusive: false,
    })).toBe(true);
  });

  test("当前税率与常见值等价时去重并保留当前原始字符串", () => {
    const options = getSupplierSkuTaxRateOptions("0.130000");

    expect(options).toHaveLength(6);
    expect(options.map(({ value }) => value)).toEqual([
      "0", "0.01", "0.03", "0.06", "0.09", "0.130000",
    ]);
    expect(options.map(({ label }) => label)).toEqual([
      "0%", "1%", "3%", "6%", "9%", "13%",
    ]);
    expect(options.at(-1)).toEqual({ value: "0.130000", label: "13%" });
  });

  test("非标准历史税率按数值排序并标记当前值", () => {
    const options = getSupplierSkuTaxRateOptions("0.075000");

    expect(options.map(({ value }) => value)).toEqual([
      "0", "0.01", "0.03", "0.06", "0.075000", "0.09", "0.13",
    ]);
    expect(options[4]).toEqual({
      value: "0.075000",
      label: "7.5%（当前税率）",
    });
  });

  test("仅租户范围和三项权限齐全时启用即时价格", () => {
    expect(canUseInlineSkuPrice({ scope: tenantScope, ...permissions })).toBe(true);
    expect(canUseInlineSkuPrice({ scope: platformScope, ...permissions })).toBe(false);
    expect(canUseInlineSkuPrice({
      scope: tenantScope,
      ...permissions,
      canManageProducts: false,
    })).toBe(false);
    expect(canUseInlineSkuPrice({
      scope: tenantScope,
      ...permissions,
      canViewCostPrice: false,
    })).toBe(false);
    expect(canUseInlineSkuPrice({
      scope: tenantScope,
      ...permissions,
      canManageCostPrice: false,
    })).toBe(false);
  });

  test("停用 SKU 只保存元数据且平台和缺权限范围保持旧模式", () => {
    expect(getSupplierSkuSaveMode({
      scope: tenantScope,
      skuStatus: "inactive",
      ...permissions,
    })).toBe("metadata-only");
    expect(getSupplierSkuSaveMode({
      scope: tenantScope,
      skuStatus: "active",
      ...permissions,
    })).toBe("inline-price");
    expect(getSupplierSkuSaveMode({
      scope: platformScope,
      skuStatus: "active",
      ...permissions,
    })).toBe("legacy");
    expect(getSupplierSkuSaveMode({
      scope: tenantScope,
      skuStatus: "active",
      ...permissions,
      canViewCostPrice: false,
    })).toBe("legacy");
  });

  test("未来价格生成简短有效期提示且无未来价格时不提示", () => {
    expect(getSupplierSkuPriceEffectiveUntilNotice(priceContext())).toBeNull();
    expect(getSupplierSkuPriceEffectiveUntilNotice(priceContext({
      next_scheduled_effective_from: "2026-09-02T08:30:00+08:00",
    }))).toMatch(/^当前价格有效至 .+$/);
  });

  test("非法未来价格时间不生成提示", () => {
    expect(getSupplierSkuPriceEffectiveUntilNotice(priceContext({
      next_scheduled_effective_from: "not-a-timestamp",
    }))).toBeNull();
  });

  test("价格读取编码恶意路径段且仅发送租户供应商范围", async () => {
    const currentContext = priceContext({ current_price: currentPrice });
    const calls = installPriceContextFetch([priceContext(), currentContext]);
    const productId = "product/id ?#";
    const skuId = "sku/id ?#";
    const scope = {
      kind: "tenant",
      tenantSupplierId: "relationship/id ?",
    } as const;

    const defaults = await loadSupplierSkuPriceDefaults(scope, productId);
    const current = await loadSupplierSkuCurrentPrice(
      scope,
      productId,
      skuId,
    );

    expect(defaults).toEqual(priceContext());
    expect(current).toEqual(currentContext);
    expect(buildPurchasableSkuPath(productId, skuId)).toBe(
      "/supplier-products/product%2Fid%20%3F%23/purchasable-skus/sku%2Fid%20%3F%23",
    );
    expect(calls.map(({ input }) => String(input))).toEqual([
      "/api/backend/supplier-products/product%2Fid%20%3F%23/purchasable-skus/price-defaults?tenantSupplierId=relationship%2Fid+%3F",
      "/api/backend/supplier-products/product%2Fid%20%3F%23/purchasable-skus/sku%2Fid%20%3F%23/price?tenantSupplierId=relationship%2Fid+%3F",
    ]);
    for (const { input, init } of calls) {
      const url = new URL(String(input), "http://admin.local");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        tenantSupplierId: "relationship/id ?",
      });
      expect(init?.method).toBeUndefined();
      expect(init?.body).toBeUndefined();
    }
  });

  test("价格读取失败时分别使用稳定 fallback message", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ success: false }, 500)) as unknown as typeof fetch;

    await expect(loadSupplierSkuPriceDefaults(
      tenantScope,
      "product-1",
    )).rejects.toMatchObject({
      message: "基础供货价默认值加载失败",
      status: 500,
    });
    await expect(loadSupplierSkuCurrentPrice(
      tenantScope,
      "product-1",
      "sku-1",
    )).rejects.toMatchObject({
      message: "SKU 当前供货价加载失败",
      status: 500,
    });
  });

  test("纯模型源码不使用 Number 转换价格字符串", () => {
    const source = readFileSync(
      new URL("./supplier-sku-price-form.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("Number(");
  });
});

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

function installPriceContextFetch(
  contexts: readonly SupplierSkuPriceContext[],
): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input, init) => {
    const context = contexts[calls.length];
    calls.push({ input, init });
    return jsonResponse({ success: true, data: context });
  }) as typeof fetch;
  return calls;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
