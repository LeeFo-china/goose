import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.string().min(1);
const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const baseUnitConversionText = z.string()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,8})?$/)
  .refine((value) => canonicalDecimal(value) !== "0");
const baseUnitConversionNumber = z.number().finite().positive()
  .refine((value) => {
    const canonical = canonicalDecimal(value);
    if (canonical === null) return false;
    const integer = canonical.split(".")[0] ?? "";
    const fraction = canonical.split(".")[1] ?? "";
    return integer.length <= 10 && fraction.length <= 8;
  });
const unitPrice = z.string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
  .refine((value) => value !== "0" && !/^0\.0+$/.test(value));
const taxRate = z.string().regex(/^(?:0|1)(?:\.\d{1,6})?$/);

const ELIGIBILITY_REASONS = [
  "module_disabled",
  "supplier_not_approved",
  "supplier_suspended",
  "supplier_blacklisted",
  "relationship_not_active",
  "required_qualification_missing",
  "required_qualification_expired",
  "active_contract_required",
] as const;
const SINGLE_FAILURE_REASONS = new Set<string>([
  ...ELIGIBILITY_REASONS,
  "validation_error",
  "invalid_product",
  "invalid_sku",
  "invalid_price",
  "actor_invalid",
  "tenant_supplier_unavailable",
  "default_price_list_draft_exists",
  "multiple_published_default_price_lists",
  "category_not_found",
  "brand_not_found",
  "purchase_unit_not_found",
  "product_conflict",
  "sku_conflict",
  "unique_conflict",
  "state_conflict",
  "product_create_failed",
  "product_activate_failed",
  "sku_create_failed",
  "sku_activate_failed",
  "price_list_version_failed",
  "price_list_copy_incomplete",
  "price_list_prepare_failed",
  "price_item_upsert_failed",
  "price_list_retire_failed",
  "price_list_publish_failed",
  "catalog_result_not_exact",
  "catalog_item_mismatch",
  "TENANT_SUPPLIER_NOT_FOUND",
  "SUPPLIER_NOT_FOUND",
  "SUPPLIER_ORDER_NOT_ELIGIBLE",
  "SUPPLIER_PRODUCT_NOT_FOUND",
  "SUPPLIER_PRODUCT_VERSION_CONFLICT",
  "SUPPLIER_PRODUCT_STATE_CONFLICT",
  "PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION",
  "SUPPLIER_SKU_NOT_FOUND",
  "SUPPLIER_SKU_VERSION_CONFLICT",
  "SUPPLIER_SKU_STATE_CONFLICT",
  "SUPPLIER_PRICE_LIST_NOT_FOUND",
  "SUPPLIER_PRICE_LIST_VERSION_CONFLICT",
  "SUPPLIER_PRICE_PERIOD_CONFLICT",
  "SUPPLIER_PRICE_LIST_INVALID_ACTION",
  "SUPPLIER_PRICE_ITEM_NOT_FOUND",
  "SUPPLIER_PROXY_ACTOR_INVALID",
  "UNIT_CONVERSION_INVALID",
]);
const reason = z.string().min(1).max(188).refine(isStableFailureReason);

const SpecValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);

export const SupplierPurchasableProductRecordSchema = z.object({
  id: uuid,
  supplier_id: uuid,
  product_code: z.string().regex(/^TP-[0-9a-fA-F]{16}$/),
  name: z.string().min(1),
  category_id: uuid,
  brand_id: uuid,
  description: z.string().nullable(),
  status: z.literal("active"),
  version: z.number().int().positive(),
  ownership_scope: z.literal("tenant"),
  owner_tenant_id: uuid,
  acting_tenant_id: uuid,
  acting_employee_id: uuid,
  operation_source: z.literal("tenant"),
  proxy_reason: z.null(),
  created_by_employee_id: uuid,
  updated_by_employee_id: uuid,
  created_at: timestamp,
  updated_at: timestamp,
}).strict();

export const SupplierPurchasableSkuRecordSchema = z.object({
  id: uuid,
  supplier_id: uuid,
  supplier_product_id: uuid,
  sku_code: z.string().regex(/^TS-[0-9a-fA-F]{16}$/),
  name: z.string().min(1),
  specification: z.string().nullable(),
  model: z.string().nullable(),
  spec_values: z.record(z.string(), SpecValueSchema),
  purchase_unit_id: uuid,
  base_unit_id: uuid,
  base_unit_conversion: baseUnitConversionNumber,
  batch_managed: z.boolean(),
  color_managed: z.boolean(),
  serial_managed: z.boolean(),
  status: z.literal("active"),
  version: z.number().int().positive(),
  ownership_scope: z.literal("tenant"),
  owner_tenant_id: uuid,
  acting_tenant_id: uuid,
  acting_employee_id: uuid,
  operation_source: z.literal("tenant"),
  proxy_reason: z.null(),
  created_by_employee_id: uuid,
  updated_by_employee_id: uuid,
  created_at: timestamp,
  updated_at: timestamp,
}).strict();

export const SupplierPurchasablePriceRecordSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  supplier_id: uuid,
  supplier_price_list_id: uuid,
  supplier_product_id: uuid,
  supplier_sku_id: uuid,
  minimum_quantity: decimal,
  maximum_quantity: decimal.nullable(),
  purchase_unit_id: uuid,
  base_unit_id: uuid,
  base_unit_conversion: baseUnitConversionText,
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean(),
  acting_tenant_id: uuid,
  acting_employee_id: uuid,
  operation_source: z.literal("tenant"),
  proxy_reason: z.null(),
  created_by_employee_id: uuid,
  updated_by_employee_id: uuid,
  created_at: timestamp,
  updated_at: timestamp,
}).strict();

export const SupplierPurchasableCatalogItemRecordSchema = z.object({
  supplier_product_id: uuid,
  product_code: z.string().regex(/^TP-[0-9a-fA-F]{16}$/),
  product_name: z.string().min(1),
  supplier_sku_id: uuid,
  sku_code: z.string().regex(/^TS-[0-9a-fA-F]{16}$/),
  sku_name: z.string().min(1),
  specification: z.string().nullable(),
  model: z.string().nullable(),
  supplier_price_list_id: uuid,
  price_list_code: z.literal("DEFAULT"),
  price_list_version: z.number().int().positive(),
  effective_from: timestamp,
  effective_until: timestamp.nullable(),
  supplier_price_list_item_id: uuid,
  purchase_unit_id: uuid,
  purchase_unit_code: z.string().min(1),
  purchase_unit_name: z.string().min(1),
  purchase_unit_symbol: z.string().min(1),
  base_unit_id: uuid,
  base_unit_code: z.string().min(1),
  base_unit_name: z.string().min(1),
  base_unit_symbol: z.string().min(1),
  base_unit_conversion: baseUnitConversionText,
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean(),
}).strict();

const CreatedResultSchema = z.object({
  status: z.literal("created"),
  idempotent: z.boolean(),
  product: SupplierPurchasableProductRecordSchema,
  sku: SupplierPurchasableSkuRecordSchema,
  price: SupplierPurchasablePriceRecordSchema,
  catalog_item: SupplierPurchasableCatalogItemRecordSchema,
}).strict().superRefine((result, context) => {
  const matches = [
    result.sku.supplier_product_id === result.product.id,
    result.price.supplier_product_id === result.product.id,
    result.catalog_item.supplier_product_id === result.product.id,
    result.price.supplier_sku_id === result.sku.id,
    result.catalog_item.supplier_sku_id === result.sku.id,
    result.price.supplier_price_list_id ===
      result.catalog_item.supplier_price_list_id,
    result.price.id === result.catalog_item.supplier_price_list_item_id,
    result.product.supplier_id === result.sku.supplier_id,
    result.product.supplier_id === result.price.supplier_id,
    result.product.owner_tenant_id === result.price.tenant_id,
    result.sku.owner_tenant_id === result.price.tenant_id,
    result.product.acting_tenant_id === result.price.tenant_id,
    result.sku.acting_tenant_id === result.price.tenant_id,
    result.price.acting_tenant_id === result.price.tenant_id,
    result.product.acting_employee_id === result.sku.acting_employee_id,
    result.product.acting_employee_id === result.price.acting_employee_id,
    result.product.created_by_employee_id ===
      result.product.acting_employee_id,
    result.sku.created_by_employee_id === result.product.acting_employee_id,
    result.price.created_by_employee_id === result.product.acting_employee_id,
    result.product.updated_by_employee_id ===
      result.product.acting_employee_id,
    result.sku.updated_by_employee_id === result.product.acting_employee_id,
    result.price.updated_by_employee_id === result.product.acting_employee_id,
    result.sku.purchase_unit_id === result.price.purchase_unit_id,
    result.sku.base_unit_id === result.price.base_unit_id,
    result.price.purchase_unit_id === result.catalog_item.purchase_unit_id,
    result.price.base_unit_id === result.catalog_item.base_unit_id,
    result.product.product_code === result.catalog_item.product_code,
    result.product.name === result.catalog_item.product_name,
    result.sku.sku_code === result.catalog_item.sku_code,
    result.sku.name === result.catalog_item.sku_name,
    result.sku.specification === result.catalog_item.specification,
    result.sku.model === result.catalog_item.model,
    sameLimitedDecimal(
      result.sku.base_unit_conversion,
      result.price.base_unit_conversion,
    ),
    sameLimitedDecimal(
      result.price.base_unit_conversion,
      result.catalog_item.base_unit_conversion,
    ),
    result.price.unit_price === result.catalog_item.unit_price,
    result.price.tax_rate === result.catalog_item.tax_rate,
    result.price.tax_inclusive === result.catalog_item.tax_inclusive,
  ];
  if (matches.every(Boolean)) return;
  context.addIssue({
    code: "custom",
    message: "可采购商品命令响应关联不一致",
  });
});

const ValidationErrorResultSchema = z.object({
  status: z.literal("validation_error"),
  idempotent: z.literal(false),
  error_code: z.enum([
    "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
    "SUPPLIER_PROXY_ACTOR_INVALID",
  ]),
  reason,
}).strict();

const StateConflictResultSchema = z.object({
  status: z.literal("state_conflict"),
  idempotent: z.literal(false),
  error_code: z.enum([
    "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
    "TENANT_SUPPLIER_NOT_FOUND",
    "SUPPLIER_NOT_FOUND",
    "SUPPLIER_ORDER_NOT_ELIGIBLE",
    "SUPPLIER_PRODUCT_STATE_CONFLICT",
    "SUPPLIER_SKU_STATE_CONFLICT",
    "SUPPLIER_PRICE_LIST_INVALID_ACTION",
    "UNIT_CONVERSION_INVALID",
  ]),
  reason,
}).strict();

export const SupplierPurchasableProductCommandEnvelopeSchema =
  z.discriminatedUnion("status", [
    CreatedResultSchema,
    ValidationErrorResultSchema,
    StateConflictResultSchema,
  ]);

export type SupplierPurchasableProductCreatedResult =
  z.infer<typeof CreatedResultSchema>;
export type SupplierPurchasableProductCommandResult =
  z.infer<typeof SupplierPurchasableProductCommandEnvelopeSchema>;

function isStableFailureReason(value: string): boolean {
  if (SINGLE_FAILURE_REASONS.has(value)) return true;
  const tokens = value.split(",");
  if (tokens.length < 2 || tokens.length > ELIGIBILITY_REASONS.length) {
    return false;
  }
  let previousIndex = -1;
  for (const token of tokens) {
    const index = ELIGIBILITY_REASONS.indexOf(
      token as (typeof ELIGIBILITY_REASONS)[number],
    );
    if (index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
}

function sameLimitedDecimal(left: number | string, right: number | string) {
  const canonicalLeft = canonicalDecimal(left);
  return canonicalLeft !== null && canonicalLeft === canonicalDecimal(right);
}

function canonicalDecimal(value: number | string): string | null {
  const match = String(value).match(
    /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/,
  );
  if (!match) return null;

  const integer = match[1] ?? "";
  const fraction = match[2] ?? "";
  const exponent = Number.parseInt(match[3] ?? "0", 10);
  const digits = `${integer}${fraction}`;
  const decimalPosition = integer.length + exponent;
  let expanded: string;
  if (decimalPosition <= 0) {
    expanded = `0.${"0".repeat(-decimalPosition)}${digits}`;
  } else if (decimalPosition >= digits.length) {
    expanded = `${digits}${"0".repeat(decimalPosition - digits.length)}`;
  } else {
    expanded = `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  }

  const [expandedInteger = "0", expandedFraction = ""] = expanded.split(".");
  const normalizedInteger = expandedInteger.replace(/^0+(?=\d)/, "");
  const normalizedFraction = expandedFraction.replace(/0+$/, "");
  return normalizedFraction.length > 0
    ? `${normalizedInteger}.${normalizedFraction}`
    : normalizedInteger;
}
