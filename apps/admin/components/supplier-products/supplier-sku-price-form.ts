import type { CatalogSpecValue } from "@gooes/domain";

import type {
  ProductApiScope,
  SupplierSku,
  SupplierSkuPriceContext,
} from "./supplier-product-types";

const UNIT_PRICE_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const ZERO_UNIT_PRICE_PATTERN = /^0(?:\.0+)?$/;
const TAX_RATE_PATTERN = /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/;
const COMMON_TAX_RATES = ["0", "0.01", "0.03", "0.06", "0.09", "0.13"] as const;

export type SupplierSkuPriceForm = {
  unitPrice: string;
  taxRate: string;
  taxInclusive: boolean;
};

export type SupplierSkuSaveMode = "inline-price" | "metadata-only" | "legacy";

type SupplierSkuMetadataFields = {
  name?: string;
  specification?: string | null;
  model?: string | null;
  batch_managed?: boolean;
  color_managed?: boolean;
  serial_managed?: boolean;
  spec_values?: Record<string, CatalogSpecValue>;
};

type SupplierSkuCreateFields = Required<SupplierSkuMetadataFields> & {
  purchase_unit_id: string;
};

type SupplierSkuUpdateFields = SupplierSkuMetadataFields & {
  expectedVersion: number;
};

type SupplierSkuUpdatePayloadFields = SupplierSkuMetadataFields & {
  expected_version: number;
};

type InlinePricePermissions = {
  scope: ProductApiScope;
  canManageProducts: boolean;
  canViewCostPrice: boolean;
  canManageCostPrice: boolean;
};

export function createInitialSkuPriceForm(
  context: SupplierSkuPriceContext,
): SupplierSkuPriceForm {
  const current = context.current_price;
  return current
    ? {
      unitPrice: current.unit_price,
      taxRate: current.tax_rate,
      taxInclusive: current.tax_inclusive,
    }
    : {
      unitPrice: "",
      taxRate: context.recommended_tax_rate,
      taxInclusive: context.recommended_tax_inclusive,
    };
}

export function buildPurchasableSkuCreatePayload({
  sku,
  priceForm,
}: {
  sku: SupplierSkuCreateFields;
  priceForm: SupplierSkuPriceForm;
}) {
  return {
    sku: {
      name: sku.name,
      purchase_unit_id: sku.purchase_unit_id,
      specification: sku.specification,
      model: sku.model,
      batch_managed: sku.batch_managed,
      color_managed: sku.color_managed,
      serial_managed: sku.serial_managed,
      spec_values: sku.spec_values,
    },
    price: pricePayload(priceForm),
  };
}

export function buildPurchasableSkuUpdatePayload({
  sku,
  priceForm,
  context,
}: {
  sku: SupplierSkuUpdateFields;
  priceForm: SupplierSkuPriceForm;
  context: SupplierSkuPriceContext;
}) {
  const current = context.current_price;
  return {
    sku: updateSkuPayload(sku),
    price: {
      ...pricePayload(priceForm),
      expected_price_list_id: current?.supplier_price_list_id ?? null,
      expected_price_list_version:
        current?.supplier_price_list_row_version ?? null,
    },
  };
}

export function isSupplierSkuPriceFormValid(
  form: SupplierSkuPriceForm,
): boolean {
  const unitPrice = form.unitPrice.trim();
  const taxRate = form.taxRate.trim();
  return UNIT_PRICE_PATTERN.test(unitPrice)
    && !ZERO_UNIT_PRICE_PATTERN.test(unitPrice)
    && TAX_RATE_PATTERN.test(taxRate);
}

export function getSupplierSkuTaxRateOptions(selectedTaxRate?: string | null) {
  const options = COMMON_TAX_RATES.map<{
    value: string;
    isCommon: boolean;
  }>((value) => ({
    value,
    isCommon: true,
  }));
  if (selectedTaxRate) {
    const selectedCanonical = canonicalDecimal(selectedTaxRate);
    const common = options.find(({ value }) =>
      canonicalDecimal(value) === selectedCanonical);
    if (common) {
      common.value = selectedTaxRate;
    } else {
      options.push({ value: selectedTaxRate, isCommon: false });
    }
  }
  return options.sort((left, right) =>
    compareDecimals(left.value, right.value)).map(({ value, isCommon }) => ({
    value,
    label: `${formatTaxRatePercent(value)}${isCommon ? "" : "（当前税率）"}`,
  }));
}

export function canUseInlineSkuPrice({
  scope,
  canManageProducts,
  canViewCostPrice,
  canManageCostPrice,
}: InlinePricePermissions): boolean {
  return scope.kind === "tenant"
    && canManageProducts
    && canViewCostPrice
    && canManageCostPrice;
}

export function getSupplierSkuSaveMode({
  skuStatus,
  ...access
}: InlinePricePermissions & {
  skuStatus?: SupplierSku["status"];
}): SupplierSkuSaveMode {
  if (!canUseInlineSkuPrice(access)) return "legacy";
  return skuStatus === "inactive" ? "metadata-only" : "inline-price";
}

export function getSupplierSkuDialogSaveMode({
  inlinePriceEnabled,
  scope,
  skuStatus,
}: {
  inlinePriceEnabled: boolean;
  scope: ProductApiScope;
  skuStatus?: SupplierSku["status"];
}): SupplierSkuSaveMode {
  return getSupplierSkuSaveMode({
    scope,
    skuStatus,
    canManageProducts: inlinePriceEnabled,
    canViewCostPrice: inlinePriceEnabled,
    canManageCostPrice: inlinePriceEnabled,
  });
}

export function getSupplierSkuPriceEffectiveUntilNotice(
  context: SupplierSkuPriceContext,
): string | null {
  if (!context.next_scheduled_effective_from) return null;
  const date = new Date(context.next_scheduled_effective_from);
  if (!Number.isFinite(date.getTime())) return null;
  const effectiveUntil = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
  return `本次价格有效至 ${effectiveUntil}`;
}

function pricePayload(form: SupplierSkuPriceForm) {
  return {
    unit_price: form.unitPrice.trim(),
    tax_rate: form.taxRate.trim(),
    tax_inclusive: form.taxInclusive,
  };
}

function updateSkuPayload(
  sku: SupplierSkuUpdateFields,
): SupplierSkuUpdatePayloadFields {
  const payload: SupplierSkuUpdatePayloadFields = {
    expected_version: sku.expectedVersion,
  };
  if (sku.name !== undefined) payload.name = sku.name;
  if (sku.specification !== undefined) payload.specification = sku.specification;
  if (sku.model !== undefined) payload.model = sku.model;
  if (sku.batch_managed !== undefined) payload.batch_managed = sku.batch_managed;
  if (sku.color_managed !== undefined) payload.color_managed = sku.color_managed;
  if (sku.serial_managed !== undefined) payload.serial_managed = sku.serial_managed;
  if (sku.spec_values !== undefined) payload.spec_values = sku.spec_values;
  return payload;
}

function formatTaxRatePercent(value: string): string {
  const [integer, fraction = ""] = value.trim().split(".");
  const shiftedFraction = fraction.padEnd(2, "0");
  const whole = `${integer}${shiftedFraction.slice(0, 2)}`
    .replace(/^0+(?=\d)/, "");
  const decimal = shiftedFraction.slice(2).replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}%` : `${whole}%`;
}

function canonicalDecimal(value: string): string {
  const [integer, fraction = ""] = value.trim().split(".");
  const canonicalFraction = fraction.replace(/0+$/, "");
  return canonicalFraction ? `${integer}.${canonicalFraction}` : integer;
}

function compareDecimals(left: string, right: string): number {
  const [leftInteger, leftFraction = ""] = canonicalDecimal(left).split(".");
  const [rightInteger, rightFraction = ""] = canonicalDecimal(right).split(".");
  if (leftInteger !== rightInteger) return leftInteger < rightInteger ? -1 : 1;
  const width = Math.max(leftFraction.length, rightFraction.length);
  const leftComparable = leftFraction.padEnd(width, "0");
  const rightComparable = rightFraction.padEnd(width, "0");
  if (leftComparable === rightComparable) return 0;
  return leftComparable < rightComparable ? -1 : 1;
}
