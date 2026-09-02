import { describe, expect, test } from "bun:test";

import {
  getSupplierSkuDialogSaveMode,
} from "./supplier-sku-price-form";
import {
  classifySupplierSkuDialogSaveFailure,
  createSupplierSkuDialogLoadWorkflow,
  createSupplierSkuDialogSaveWorkflow,
  isSupplierSkuPriceFieldsDisabled,
  prepareSupplierSkuDialogSave,
} from "./supplier-sku-dialog-workflow";
import type {
  CatalogSpecDefinition,
  SupplierSkuPriceContext,
} from "./supplier-product-types";

const scope = {
  kind: "tenant",
  tenantSupplierId: "relationship-1",
} as const;
const definitions = [{ id: "spec-1" }] as CatalogSpecDefinition[];
const priceContext: SupplierSkuPriceContext = {
  currency: "CNY",
  recommended_tax_rate: "0.13",
  recommended_tax_inclusive: false,
  next_scheduled_effective_from: null,
  current_price: null,
};

describe("SupplierSkuDialog save session gate", () => {
  test("close/reopen 后旧 success 不执行任何回写 callback", async () => {
    const request = deferred<void>();
    const callbacks = callbackCounters();
    const workflow = createSupplierSkuDialogSaveWorkflow();
    workflow.beginSession();
    const token = workflow.beginSave();
    const pending = workflow.execute(token, savePlan(), {
      create: () => request.promise,
      mutate: async () => undefined,
    }, callbacks.handlers);

    workflow.invalidate();
    workflow.beginSession();
    request.resolve();
    await pending;

    expect(callbacks.values()).toEqual({ success: 0, error: 0, settled: 0 });
  });

  test("close/reopen 后旧 error 静默且不清理新会话 saving/attempt", async () => {
    const request = deferred<void>();
    const callbacks = callbackCounters();
    const workflow = createSupplierSkuDialogSaveWorkflow();
    workflow.beginSession();
    const token = workflow.beginSave();
    const pending = workflow.execute(token, savePlan(), {
      create: () => request.promise,
      mutate: async () => undefined,
    }, callbacks.handlers);

    workflow.invalidate();
    workflow.beginSession();
    request.reject(conflict());
    await pending;

    expect(callbacks.values()).toEqual({ success: 0, error: 0, settled: 0 });
  });

  test("同一 session 稳定版本冲突清除 attempt，transport failure 才保留", async () => {
    const workflow = createSupplierSkuDialogSaveWorkflow();
    workflow.beginSession();
    let attempt = null;
    const editInput = {
      ...saveInput(),
      sku: { id: "sku-1", version: 3 },
    };
    const first = prepareSupplierSkuDialogSave(editInput, attempt)!;
    attempt = first.attempt;
    const failed = callbackCounters();

    await workflow.execute(workflow.beginSave(), first, {
      create: async () => undefined,
      mutate: async () => {
        throw conflict();
      },
    }, {
      ...failed.handlers,
      onError: (error) => {
        failed.handlers.onError();
        if (classifySupplierSkuDialogSaveFailure(error) !== "transport-uncertain") {
          attempt = null;
        }
      },
    });
    expect(failed.values()).toEqual({ success: 0, error: 1, settled: 1 });
    expect(attempt).toBeNull();

    const retry = prepareSupplierSkuDialogSave(editInput, attempt)!;
    expect(retry.attempt.idempotencyKey).not.toBe(first.attempt.idempotencyKey);
    expect(retry.requestPath).toBe(first.requestPath);
    expect(retry.payload).toEqual(first.payload);
    const succeeded = callbackCounters();
    await workflow.execute(workflow.beginSave(), retry, {
      create: async () => undefined,
      mutate: async () => undefined,
    }, succeeded.handlers);
    expect(succeeded.values()).toEqual({ success: 1, error: 0, settled: 1 });
  });

  test("传输结果不确定时 retry 复用同一 payload 和幂等 key", async () => {
    const workflow = createSupplierSkuDialogSaveWorkflow();
    workflow.beginSession();
    const input = {
      ...saveInput(),
      sku: { id: "sku-1", version: 3 },
    };
    const attempt = prepareSupplierSkuDialogSave(input, null)!.attempt;
    const first = prepareSupplierSkuDialogSave(input, attempt)!;

    await workflow.execute(workflow.beginSave(), first, {
      create: async () => undefined,
      mutate: async () => {
        throw new TypeError("fetch failed");
      },
    }, {
      onSuccess: () => undefined,
      onError: (error) => {
        expect(classifySupplierSkuDialogSaveFailure(error))
          .toBe("transport-uncertain");
      },
      onSettled: () => undefined,
    });

    const retry = prepareSupplierSkuDialogSave(input, attempt)!;
    expect(retry.attempt).toBe(first.attempt);
    expect(retry.payload).toEqual(first.payload);
    expect(retry.attempt.idempotencyKey).toBe(first.attempt.idempotencyKey);
  });
});

describe("SupplierSkuDialog load retry and production state", () => {
  test("current load 失败可 retry，新 generation 成功", async () => {
    const workflow = createSupplierSkuDialogLoadWorkflow();
    await expect(workflow.load({ inlinePriceEnabled: true, scope }, {
      loadSpecDefinitions: async () => {
        throw new Error("规格加载失败");
      },
      loadPriceDefaults: async () => priceContext,
      loadCurrentPrice: async () => priceContext,
    })).rejects.toThrow("规格加载失败");

    expect(await workflow.load({ inlinePriceEnabled: true, scope }, {
      loadSpecDefinitions: async () => definitions,
      loadPriceDefaults: async () => priceContext,
      loadCurrentPrice: async () => priceContext,
    })).toEqual({ definitions, priceContext });
  });

  test("retry 后旧 generation 的 load error 静默", async () => {
    const staleRequest = deferred<CatalogSpecDefinition[]>();
    const workflow = createSupplierSkuDialogLoadWorkflow();
    const stale = workflow.load({ inlinePriceEnabled: false, scope }, {
      loadSpecDefinitions: () => staleRequest.promise,
      loadPriceDefaults: async () => priceContext,
      loadCurrentPrice: async () => priceContext,
    });
    const current = workflow.load({ inlinePriceEnabled: false, scope }, {
      loadSpecDefinitions: async () => definitions,
      loadPriceDefaults: async () => priceContext,
      loadCurrentPrice: async () => priceContext,
    });

    staleRequest.reject(new Error("旧错误"));
    expect(await stale).toBeNull();
    expect(await current).toEqual({ definitions, priceContext: null });
  });

  test("dialog 生产 helper 推导 save mode 和加载禁用状态", () => {
    expect(getSupplierSkuDialogSaveMode({
      inlinePriceEnabled: true,
      scope,
      skuStatus: "active",
    })).toBe("inline-price");
    expect(getSupplierSkuDialogSaveMode({
      inlinePriceEnabled: true,
      scope,
      skuStatus: "inactive",
    })).toBe("metadata-only");
    expect(getSupplierSkuDialogSaveMode({
      inlinePriceEnabled: false,
      scope,
      skuStatus: "active",
    })).toBe("legacy");
    expect(getSupplierSkuDialogSaveMode({
      inlinePriceEnabled: true,
      scope: { kind: "platform", supplierId: "supplier-1" },
      skuStatus: "active",
    })).toBe("legacy");
    expect(isSupplierSkuPriceFieldsDisabled({
      loading: true,
      saveMode: "inline-price",
    })).toBe(true);
    expect(isSupplierSkuPriceFieldsDisabled({
      loading: false,
      saveMode: "inline-price",
    })).toBe(false);
    expect(isSupplierSkuPriceFieldsDisabled({
      loading: false,
      saveMode: "metadata-only",
    })).toBe(true);
  });
});

function saveInput() {
  return {
    saveMode: "inline-price" as const,
    scope,
    productId: "product-1",
    fields: {
      name: "18L",
      specification: "18L",
      model: null,
      batch_managed: false,
      color_managed: false,
      serial_managed: false,
      spec_values: {},
    },
    purchaseUnitId: "unit-box",
    priceForm: {
      unitPrice: "318.00",
      taxRate: "0.13",
      taxInclusive: false,
    },
    priceContext,
  };
}

function savePlan() {
  return prepareSupplierSkuDialogSave(saveInput(), null)!;
}

function callbackCounters() {
  let success = 0;
  let error = 0;
  let settled = 0;
  return {
    handlers: {
      onSuccess: () => { success += 1; },
      onError: () => { error += 1; },
      onSettled: () => { settled += 1; },
    },
    values: () => ({ success, error, settled }),
  };
}

function conflict() {
  const error = new Error("conflict") as Error & { status: number; code: string };
  error.status = 409;
  error.code = "SUPPLIER_SKU_VERSION_CONFLICT";
  return error;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}
