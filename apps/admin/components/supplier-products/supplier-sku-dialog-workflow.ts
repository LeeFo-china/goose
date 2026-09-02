import type { CatalogSpecValue } from "@gooes/domain";

import {
  buildPurchasableSkuPath,
  buildSkuResourcePath,
} from "./supplier-product-api";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import {
  buildPurchasableSkuCreatePayload,
  buildPurchasableSkuUpdatePayload,
  isSupplierSkuPriceFormValid,
  type SupplierSkuPriceForm,
  type SupplierSkuSaveMode,
} from "./supplier-sku-price-form";
import type {
  CatalogOption,
  CatalogSpecDefinition,
  ProductApiScope,
  SupplierSku,
  SupplierSkuPriceContext,
  UnitReference,
} from "./supplier-product-types";

type LoadInput = {
  inlinePriceEnabled: boolean;
  scope: ProductApiScope;
  sku?: Pick<SupplierSku, "id" | "status">;
};

type LoadDependencies = {
  loadSpecDefinitions: () => Promise<CatalogSpecDefinition[]>;
  loadPriceDefaults: () => Promise<SupplierSkuPriceContext | null>;
  loadCurrentPrice: (skuId: string) => Promise<SupplierSkuPriceContext | null>;
};

export type SupplierSkuDialogLoadResult = {
  definitions: CatalogSpecDefinition[];
  priceContext: SupplierSkuPriceContext | null;
};

export function createSupplierSkuDialogLoadWorkflow() {
  let generation = 0;

  return {
    async load(
      input: LoadInput,
      dependencies: LoadDependencies,
    ): Promise<SupplierSkuDialogLoadResult | null> {
      const requestGeneration = ++generation;
      try {
        const specRequest = dependencies.loadSpecDefinitions();
        const priceRequest = getPriceRequest(input, dependencies);
        const [definitions, priceContext] = await Promise.all([
          specRequest,
          priceRequest,
        ]);
        return requestGeneration === generation
          ? { definitions, priceContext }
          : null;
      } catch (error) {
        if (requestGeneration !== generation) return null;
        throw error;
      }
    },
    invalidate() {
      generation += 1;
    },
  };
}

function getPriceRequest(
  input: LoadInput,
  dependencies: LoadDependencies,
): Promise<SupplierSkuPriceContext | null> {
  if (!input.inlinePriceEnabled || input.scope.kind !== "tenant") {
    return Promise.resolve(null);
  }
  if (!input.sku) return dependencies.loadPriceDefaults();
  if (input.sku.status === "inactive") return Promise.resolve(null);
  return dependencies.loadCurrentPrice(input.sku.id);
}

type SupplierSkuMetadataFields = {
  name: string;
  specification: string | null;
  model: string | null;
  batch_managed: boolean;
  color_managed: boolean;
  serial_managed: boolean;
  spec_values: Record<string, CatalogSpecValue>;
};

type SaveInput = {
  saveMode: SupplierSkuSaveMode;
  scope: ProductApiScope;
  productId: string;
  sku?: Pick<SupplierSku, "id" | "version">;
  fields: SupplierSkuMetadataFields;
  purchaseUnitId: string;
  priceForm: SupplierSkuPriceForm;
  priceContext: SupplierSkuPriceContext | null;
};

export type SupplierSkuDialogSavePlan = {
  attempt: SupplierCommandAttempt;
  method: "POST" | "PATCH";
  payload: unknown;
  requestPath: string;
  resourcePath: string;
  scope: ProductApiScope;
};

export type SupplierSkuDialogSaveFailureDisposition =
  | "version-conflict"
  | "transport-uncertain"
  | "definitive";

const VERSION_CONFLICT_CODES = new Set([
  "SUPPLIER_SKU_VERSION_CONFLICT",
  "SUPPLIER_PRICE_LIST_VERSION_CONFLICT",
]);

export function classifySupplierSkuDialogSaveFailure(
  error: unknown,
): SupplierSkuDialogSaveFailureDisposition {
  const status = getErrorField(error, "status");
  const code = getErrorField(error, "code");
  if (status === 409 && typeof code === "string" &&
    VERSION_CONFLICT_CODES.has(code)) {
    return "version-conflict";
  }
  if (typeof status !== "number" || status === 408 || status >= 500) {
    return "transport-uncertain";
  }
  return "definitive";
}

export async function refreshSupplierSkuDialogVersionConflict(
  input: {
    inlinePriceEnabled: boolean;
    scope: ProductApiScope;
    productId: string;
    sku: Pick<SupplierSku, "id" | "sku_code" | "status">;
    priceForm: SupplierSkuPriceForm;
  },
  dependencies: {
    loadCurrentSku: () => Promise<SupplierSku>;
    loadCurrentPrice: (skuId: string) => Promise<SupplierSkuPriceContext>;
  },
) {
  if (!input.inlinePriceEnabled || input.scope.kind !== "tenant") return null;

  const sku = await dependencies.loadCurrentSku();
  const priceContext = sku.status === "inactive"
    ? null
    : await dependencies.loadCurrentPrice(sku.id);
  return { sku, priceContext, priceForm: input.priceForm };
}

export function prepareSupplierSkuDialogSave(
  input: SaveInput,
  currentAttempt: SupplierCommandAttempt | null,
): SupplierSkuDialogSavePlan | null {
  if (input.saveMode === "inline-price" &&
    (!input.priceContext || !isSupplierSkuPriceFormValid(input.priceForm))) {
    return null;
  }
  const payload = buildSavePayload(input);
  const resourcePath = input.saveMode === "inline-price"
    ? buildPurchasableSkuPath(input.productId, input.sku?.id ?? ":skuId")
    : buildSkuResourcePath(input.scope, input.productId, input.sku?.id ?? ":skuId");
  const attemptInput = {
    scope: `${input.scope.kind}-supplier-sku-${input.sku ? "update" : "create"}`,
    resourcePath,
    payload,
  };
  if (input.sku) {
    return {
      attempt: resolveSupplierCommandAttempt(currentAttempt, attemptInput),
      method: "PATCH",
      payload,
      requestPath: resourcePath,
      resourcePath,
      scope: input.scope,
    };
  }
  const attempt = resolveSupplierCommandAttempt(currentAttempt, {
    ...attemptInput,
    allocateResourceId: true,
  });
  return {
    attempt,
    method: "POST",
    payload,
    requestPath: input.saveMode === "inline-price"
      ? buildPurchasableSkuPath(input.productId, attempt.resourceId)
      : buildSkuResourcePath(input.scope, input.productId, attempt.resourceId),
    resourcePath,
    scope: input.scope,
  };
}

function buildSavePayload(input: SaveInput) {
  if (input.saveMode !== "inline-price") {
    return input.sku
      ? { ...input.fields, expected_version: input.sku.version }
      : { ...input.fields, purchase_unit_id: input.purchaseUnitId };
  }
  return input.sku
    ? buildPurchasableSkuUpdatePayload({
      sku: { ...input.fields, expectedVersion: input.sku.version },
      priceForm: input.priceForm,
      context: input.priceContext!,
    })
    : buildPurchasableSkuCreatePayload({
      sku: { ...input.fields, purchase_unit_id: input.purchaseUnitId },
      priceForm: input.priceForm,
    });
}

type SaveDependencies = {
  create: (
    path: string,
    scope: ProductApiScope,
    payload: unknown,
    idempotencyKey: string,
  ) => Promise<unknown>;
  mutate: (
    path: string,
    scope: ProductApiScope,
    payload: unknown,
    idempotencyKey: string,
    method: "PATCH",
  ) => Promise<unknown>;
  onSuccess: () => void | Promise<void>;
};

type SaveTransport = Omit<SaveDependencies, "onSuccess">;

type SaveCallbacks = {
  onSuccess: () => void | Promise<void>;
  onError: (error: unknown) => void | Promise<void>;
  onSettled: () => void | Promise<void>;
};

export function createSupplierSkuDialogSaveWorkflow() {
  let generation = 0;

  return {
    beginSession() {
      generation += 1;
    },
    beginSave() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    async execute(
      token: number,
      plan: SupplierSkuDialogSavePlan,
      dependencies: SaveTransport,
      callbacks: SaveCallbacks,
    ) {
      try {
        await sendSupplierSkuDialogSave(plan, dependencies);
      } catch (error) {
        if (token !== generation) return;
        await callbacks.onError(error);
        if (token === generation) await callbacks.onSettled();
        return;
      }
      if (token !== generation) return;
      try {
        await callbacks.onSuccess();
      } finally {
        if (token === generation) await callbacks.onSettled();
      }
    },
  };
}

export async function executeSupplierSkuDialogSave(
  plan: SupplierSkuDialogSavePlan,
  dependencies: SaveDependencies,
) {
  await sendSupplierSkuDialogSave(plan, dependencies);
  await dependencies.onSuccess();
}

async function sendSupplierSkuDialogSave(
  plan: SupplierSkuDialogSavePlan,
  dependencies: SaveTransport,
) {
  if (plan.method === "PATCH") {
    await dependencies.mutate(
      plan.requestPath,
      plan.scope,
      plan.payload,
      plan.attempt.idempotencyKey,
      "PATCH",
    );
  } else {
    await dependencies.create(
      plan.requestPath,
      plan.scope,
      plan.payload,
      plan.attempt.idempotencyKey,
    );
  }
}

function getErrorField(error: unknown, field: "status" | "code"): unknown {
  return typeof error === "object" && error !== null && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

export function isSupplierSkuPriceFieldsDisabled({
  loading,
  saveMode,
}: {
  loading: boolean;
  saveMode: SupplierSkuSaveMode;
}) {
  return loading || saveMode === "metadata-only";
}

export function resolveSupplierSkuPurchaseUnitLabel(
  purchaseUnitId: string,
  options: CatalogOption[],
  actualUnit?: Pick<UnitReference, "name" | "symbol">,
) {
  if (actualUnit) return actualUnit.symbol || actualUnit.name;
  if (!purchaseUnitId) return "所选采购单位";
  const selected = options.find(({ id }) => id === purchaseUnitId);
  return selected?.symbol || selected?.name || "所选采购单位";
}
