import { describe, expect, test } from "bun:test";

import {
  canReadSupplierProductWorkspace,
  shouldLoadPriceLists,
} from "./supplier-product-rules";
import {
  canUseInlineSkuPrice,
  type SupplierSkuPriceForm,
} from "./supplier-sku-price-form";
import {
  createSupplierSkuDialogLoadWorkflow,
  executeSupplierSkuDialogSave,
  prepareSupplierSkuDialogSave,
  resolveSupplierSkuPurchaseUnitLabel,
} from "./supplier-sku-dialog-workflow";
import type {
  CatalogSpecDefinition,
  ProductApiScope,
  SupplierSkuPriceContext,
} from "./supplier-product-types";

const tenantScope = {
  kind: "tenant",
  tenantSupplierId: "relationship-1",
} as const satisfies ProductApiScope;
const platformScope = {
  kind: "platform",
  supplierId: "supplier-1",
} as const satisfies ProductApiScope;
const definitions = [{ id: "spec-1" }] as CatalogSpecDefinition[];
const defaults = priceContext();
const current = priceContext({
  current_price: {
    supplier_price_list_id: "price-list-1",
    supplier_price_list_version: 8,
    supplier_price_list_row_version: 5,
    supplier_price_list_item_id: "price-item-1",
    unit_price: "318.00",
    tax_rate: "0.13",
    tax_inclusive: false,
    effective_from: "2026-09-01T08:00:00+08:00",
    effective_until: null,
  },
});
const fields = {
  name: "18L",
  specification: "18L",
  model: null,
  batch_managed: false,
  color_managed: false,
  serial_managed: false,
  spec_values: {},
};
const priceForm: SupplierSkuPriceForm = {
  unitPrice: "318.00",
  taxRate: "0.13",
  taxInclusive: false,
};

describe("SupplierSkuDialog 加载工作流", () => {
  test("tenant combined create 读取默认值，edit 读取当前价，并始终读取规格", async () => {
    const calls: string[] = [];
    const workflow = createSupplierSkuDialogLoadWorkflow();
    const dependencies = {
      loadSpecDefinitions: async () => {
        calls.push("spec");
        return definitions;
      },
      loadPriceDefaults: async () => {
        calls.push("defaults");
        return defaults;
      },
      loadCurrentPrice: async () => {
        calls.push("current");
        return current;
      },
    };

    expect(await workflow.load({ inlinePriceEnabled: true, scope: tenantScope }, dependencies))
      .toEqual({ definitions, priceContext: defaults });
    expect(await workflow.load({
      inlinePriceEnabled: true,
      scope: tenantScope,
      sku: { id: "sku-1", status: "draft" },
    }, dependencies)).toEqual({ definitions, priceContext: current });
    expect(calls).toEqual(["spec", "defaults", "spec", "current"]);
  });

  test.each([
    ["inactive", tenantScope, true, { id: "sku-1", status: "inactive" as const }],
    ["product-only", tenantScope, false, undefined],
    ["platform", platformScope, true, undefined],
  ])("%s 模式只读规格，不读取价格", async (_label, scope, enabled, sku) => {
    let priceReads = 0;
    const result = await createSupplierSkuDialogLoadWorkflow().load({
      inlinePriceEnabled: enabled,
      scope,
      sku,
    }, {
      loadSpecDefinitions: async () => definitions,
      loadPriceDefaults: async () => {
        priceReads += 1;
        return defaults;
      },
      loadCurrentPrice: async () => {
        priceReads += 1;
        return current;
      },
    });

    expect(result).toEqual({ definitions, priceContext: null });
    expect(priceReads).toBe(0);
  });

  test("规格和价格属于同一 Promise 编排，且关闭后的 stale 结果不应用", async () => {
    const spec = deferred<CatalogSpecDefinition[]>();
    const price = deferred<SupplierSkuPriceContext>();
    const workflow = createSupplierSkuDialogLoadWorkflow();
    let settled = false;
    const pending = workflow.load({ inlinePriceEnabled: true, scope: tenantScope }, {
      loadSpecDefinitions: () => spec.promise,
      loadPriceDefaults: () => price.promise,
      loadCurrentPrice: async () => current,
    }).then((result) => {
      settled = true;
      return result;
    });

    spec.resolve(definitions);
    await Promise.resolve();
    expect(settled).toBe(false);
    workflow.invalidate();
    price.resolve(defaults);
    expect(await pending).toBeNull();
  });

  test("较新的 generation 使先发请求结果失效", async () => {
    const first = deferred<CatalogSpecDefinition[]>();
    const workflow = createSupplierSkuDialogLoadWorkflow();
    const stale = workflow.load({ inlinePriceEnabled: false, scope: tenantScope }, {
      loadSpecDefinitions: () => first.promise,
      loadPriceDefaults: async () => defaults,
      loadCurrentPrice: async () => current,
    });
    const latest = workflow.load({ inlinePriceEnabled: false, scope: tenantScope }, {
      loadSpecDefinitions: async () => definitions,
      loadPriceDefaults: async () => defaults,
      loadCurrentPrice: async () => current,
    });

    first.resolve([]);
    expect(await stale).toBeNull();
    expect(await latest).toEqual({ definitions, priceContext: null });
  });
});

describe("SupplierSkuDialog 保存工作流", () => {
  test("组合 create 和 edit 使用购入 SKU 路径及完整价格 payload", () => {
    const createPlan = prepareSupplierSkuDialogSave({
      saveMode: "inline-price",
      scope: tenantScope,
      productId: "product-1",
      fields,
      purchaseUnitId: "unit-box",
      priceForm,
      priceContext: defaults,
    }, null);
    const editPlan = prepareSupplierSkuDialogSave({
      saveMode: "inline-price",
      scope: tenantScope,
      productId: "product-1",
      sku: { id: "sku-1", version: 3 },
      fields,
      purchaseUnitId: "unit-unwanted",
      priceForm,
      priceContext: current,
    }, null);

    expect(createPlan?.resourcePath).toBe(
      "/supplier-products/product-1/purchasable-skus/%3AskuId",
    );
    expect(createPlan?.requestPath).toStartWith(
      "/supplier-products/product-1/purchasable-skus/",
    );
    expect(createPlan?.payload).toMatchObject({
      sku: { purchase_unit_id: "unit-box" },
      price: { unit_price: "318.00", tax_rate: "0.13", tax_inclusive: false },
    });
    expect(editPlan?.requestPath).toBe(
      "/supplier-products/product-1/purchasable-skus/sku-1",
    );
    expect(editPlan?.payload).toMatchObject({
      sku: { expected_version: 3 },
      price: {
        expected_price_list_id: "price-list-1",
        expected_price_list_version: 5,
      },
    });
    expect((editPlan?.payload as { sku: object }).sku)
      .not.toHaveProperty("purchase_unit_id");
  });

  test("legacy 和 inactive metadata edit 使用原 SKU resource path", () => {
    for (const saveMode of ["legacy", "metadata-only"] as const) {
      const plan = prepareSupplierSkuDialogSave({
        saveMode,
        scope: tenantScope,
        productId: "product-1",
        sku: { id: "sku-1", version: 3 },
        fields,
        purchaseUnitId: "unit-box",
        priceForm,
        priceContext: null,
      }, null);

      expect(plan?.requestPath).toBe(
        "/supplier-products/product-1/skus/sku-1",
      );
      expect(plan?.payload).toEqual({ ...fields, expected_version: 3 });
    }

    const platformCreate = prepareSupplierSkuDialogSave({
      saveMode: "legacy",
      scope: platformScope,
      productId: "product-1",
      fields,
      purchaseUnitId: "unit-box",
      priceForm,
      priceContext: null,
    }, null);
    expect(platformCreate?.resourcePath).toBe(
      "/platform/supplier-products/product-1/skus/:skuId",
    );
    expect(platformCreate?.requestPath).toStartWith(
      "/platform/supplier-products/product-1/skus/",
    );
    expect(platformCreate?.payload).toEqual({
      ...fields,
      purchase_unit_id: "unit-box",
    });
  });

  test("409 后保留 caller attempt 和表单，retry 复用 path/payload/key；成功才 close/reset", async () => {
    const callerForm = { ...priceForm };
    let callerAttempt = null;
    let closes = 0;
    let resets = 0;
    const first = prepareSupplierSkuDialogSave({
      saveMode: "inline-price",
      scope: tenantScope,
      productId: "product-1",
      fields,
      purchaseUnitId: "unit-box",
      priceForm: callerForm,
      priceContext: defaults,
    }, callerAttempt);
    expect(first).not.toBeNull();
    callerAttempt = first!.attempt;

    await expect(executeSupplierSkuDialogSave(first!, {
      create: async () => {
        const conflict = new Error("conflict") as Error & { status: number };
        conflict.status = 409;
        throw conflict;
      },
      mutate: async () => undefined,
      onSuccess: () => {
        closes += 1;
        resets += 1;
      },
    })).rejects.toMatchObject({ status: 409 });
    expect(closes).toBe(0);
    expect(resets).toBe(0);
    expect(callerForm).toEqual(priceForm);
    expect(callerAttempt).toBe(first!.attempt);

    const retry = prepareSupplierSkuDialogSave({
      saveMode: "inline-price",
      scope: tenantScope,
      productId: "product-1",
      fields,
      purchaseUnitId: "unit-box",
      priceForm: callerForm,
      priceContext: defaults,
    }, callerAttempt);
    expect(retry?.attempt).toBe(first!.attempt);
    expect(retry?.requestPath).toBe(first!.requestPath);
    expect(retry?.payload).toEqual(first!.payload);

    await executeSupplierSkuDialogSave(retry!, {
      create: async () => undefined,
      mutate: async () => undefined,
      onSuccess: () => {
        closes += 1;
        resets += 1;
      },
    });
    expect(closes).toBe(1);
    expect(resets).toBe(1);
  });
});

describe("SKU 价格权限和采购单位显示", () => {
  test("读取权限和即时价格权限通过生产纯函数保持边界", () => {
    expect(canReadSupplierProductWorkspace({
      canViewProducts: false,
      canManageProducts: false,
      canViewCostPrice: true,
      canManageCostPrice: false,
    })).toBe(true);
    expect(canReadSupplierProductWorkspace({
      canViewProducts: false,
      canManageProducts: false,
      canViewCostPrice: false,
      canManageCostPrice: true,
    })).toBe(false);
    expect(canReadSupplierProductWorkspace({
      canViewProducts: false,
      canManageProducts: true,
      canViewCostPrice: false,
      canManageCostPrice: false,
    })).toBe(true);
    expect(shouldLoadPriceLists(false, "relationship-1")).toBe(false);
    const permissions = {
      scope: tenantScope,
      canManageProducts: true,
      canViewCostPrice: true,
      canManageCostPrice: true,
    };
    expect(canUseInlineSkuPrice(permissions)).toBe(true);
    expect(canUseInlineSkuPrice({ ...permissions, canManageProducts: false })).toBe(false);
    expect(canUseInlineSkuPrice({ ...permissions, canViewCostPrice: false })).toBe(false);
    expect(canUseInlineSkuPrice({ ...permissions, canManageCostPrice: false })).toBe(false);
  });

  test("create 随已选单位实时解析 symbol/name，未选回退；edit 固定实际单位", () => {
    const options = [
      { id: "unit-box", code: "BOX", name: "箱", symbol: "箱" },
      { id: "unit-case", code: "CASE", name: "整件" },
    ];

    expect(resolveSupplierSkuPurchaseUnitLabel("unit-box", options)).toBe("箱");
    expect(resolveSupplierSkuPurchaseUnitLabel("unit-case", options)).toBe("整件");
    expect(resolveSupplierSkuPurchaseUnitLabel("", options)).toBe("所选采购单位");
    expect(resolveSupplierSkuPurchaseUnitLabel("unit-box", options, {
      name: "实际采购箱",
      symbol: "实箱",
    })).toBe("实箱");
  });
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
