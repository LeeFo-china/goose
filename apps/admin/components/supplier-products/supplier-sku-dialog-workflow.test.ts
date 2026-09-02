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
  classifySupplierSkuDialogSaveFailure,
  createSupplierSkuDialogLoadWorkflow,
  executeSupplierSkuDialogSave,
  prepareSupplierSkuDialogSave,
  refreshSupplierSkuDialogVersionConflict,
  resolveSupplierSkuPurchaseUnitLabel,
} from "./supplier-sku-dialog-workflow";
import type {
  CatalogSpecDefinition,
  ProductApiScope,
  SupplierSku,
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

  test("稳定版本冲突刷新隐藏版本并保留可见表单，retry 使用新 key", async () => {
    const callerForm = { ...priceForm };
    let callerAttempt = null;
    let closes = 0;
    let resets = 0;
    const first = prepareSupplierSkuDialogSave({
      saveMode: "inline-price",
      scope: tenantScope,
      productId: "product-1",
      sku: { id: "sku-1", version: 3 },
      fields,
      purchaseUnitId: "unit-box",
      priceForm: callerForm,
      priceContext: current,
    }, callerAttempt);
    expect(first).not.toBeNull();
    callerAttempt = first!.attempt;

    await expect(executeSupplierSkuDialogSave(first!, {
      create: async () => undefined,
      mutate: async () => {
        const conflict = new Error("conflict") as Error & {
          status: number;
          code: string;
        };
        conflict.status = 409;
        conflict.code = "SUPPLIER_PRICE_LIST_VERSION_CONFLICT";
        throw conflict;
      },
      onSuccess: () => {
        closes += 1;
        resets += 1;
      },
    })).rejects.toMatchObject({ status: 409 });
    expect(closes).toBe(0);
    expect(resets).toBe(0);
    expect(callerForm).toEqual(priceForm);
    expect(classifySupplierSkuDialogSaveFailure({
      status: 409,
      code: "SUPPLIER_PRICE_LIST_VERSION_CONFLICT",
    })).toBe("version-conflict");
    callerAttempt = null;

    const latestSku: SupplierSku = {
      id: "sku-1",
      supplier_id: "supplier-1",
      supplier_product_id: "product-1",
      sku_code: "TS-1",
      name: "服务端名称",
      specification: "服务端规格",
      model: "SERVER",
      spec_values: {},
      purchase_unit_id: "unit-box",
      base_unit_id: "unit-box",
      base_unit_conversion: "1",
      batch_managed: false,
      color_managed: false,
      serial_managed: false,
      status: "active",
      version: 4,
      ownership_scope: "tenant",
      owner_tenant_id: "tenant-1",
      purchase_unit: {
        id: "unit-box",
        code: "BOX",
        name: "箱",
        symbol: "箱",
        status: "active",
      },
      base_unit: {
        id: "unit-box",
        code: "BOX",
        name: "箱",
        symbol: "箱",
        status: "active",
      },
      updated_at: "2026-09-02T00:00:00Z",
    };
    const latestPrice = priceContext({
      current_price: {
        ...current.current_price!,
        supplier_price_list_id: "price-list-2",
        supplier_price_list_version: 6,
        supplier_price_list_row_version: 6,
        unit_price: "399.00",
      },
    });
    const refreshed = await refreshSupplierSkuDialogVersionConflict({
      inlinePriceEnabled: true,
      scope: tenantScope,
      productId: "product-1",
      sku: latestSku,
      priceForm: callerForm,
    }, {
      loadCurrentSku: async () => latestSku,
      loadCurrentPrice: async () => latestPrice,
    });
    expect(refreshed).toEqual({
      sku: latestSku,
      priceContext: latestPrice,
      priceForm: callerForm,
    });
    expect(refreshed?.priceForm).toBe(callerForm);

    const retry = prepareSupplierSkuDialogSave({
      saveMode: "inline-price",
      scope: tenantScope,
      productId: "product-1",
      sku: refreshed!.sku,
      fields,
      purchaseUnitId: "unit-box",
      priceForm: callerForm,
      priceContext: refreshed!.priceContext,
    }, callerAttempt);
    expect(retry?.attempt.idempotencyKey).not.toBe(first!.attempt.idempotencyKey);
    expect(retry?.requestPath).toBe(first!.requestPath);
    expect(retry?.payload).toMatchObject({
      sku: { expected_version: 4 },
      price: {
        unit_price: "318.00",
        expected_price_list_id: "price-list-2",
        expected_price_list_version: 6,
      },
    });

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

  test("只有传输结果不确定时 retry 才复用 attempt", () => {
    expect(classifySupplierSkuDialogSaveFailure(new TypeError("fetch failed")))
      .toBe("transport-uncertain");
    expect(classifySupplierSkuDialogSaveFailure({ status: 503 }))
      .toBe("transport-uncertain");
    expect(classifySupplierSkuDialogSaveFailure({ status: 422 }))
      .toBe("definitive");
    expect(classifySupplierSkuDialogSaveFailure({
      status: 409,
      code: "SUPPLIER_SKU_VERSION_CONFLICT",
    })).toBe("version-conflict");
  });

  test("inactive、platform 或缺少组合权限时冲突刷新不读取价格", async () => {
    let priceReads = 0;
    const dependencies = {
      loadCurrentSku: async () => ({ status: "inactive" }) as never,
      loadCurrentPrice: async () => {
        priceReads += 1;
        return current;
      },
    };
    const base = {
      productId: "product-1",
      sku: { id: "sku-1", sku_code: "TS-1", status: "active" as const },
      priceForm,
    };

    expect(await refreshSupplierSkuDialogVersionConflict({
      ...base,
      inlinePriceEnabled: true,
      scope: tenantScope,
    }, dependencies)).toMatchObject({ priceContext: null });
    expect(await refreshSupplierSkuDialogVersionConflict({
      ...base,
      inlinePriceEnabled: false,
      scope: tenantScope,
    }, dependencies)).toBeNull();
    expect(await refreshSupplierSkuDialogVersionConflict({
      ...base,
      inlinePriceEnabled: true,
      scope: platformScope,
    }, dependencies)).toBeNull();
    expect(priceReads).toBe(0);
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
