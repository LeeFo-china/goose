import { SUPPLIER_SKU_STATUS_VALUES } from "@gooes/domain";
import { z } from "zod";

import { sameLimitedDecimal } from "@/repositories/supplier-purchasable-product-records";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const unitPrice = z.string().regex(
  /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/,
).refine((value) => value !== "0" && !/^0\.0+$/.test(value));
const taxRate = z.string().regex(
  /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/,
);
const tenantSkuCode = z.string().regex(
  /^TS-(?:[0-9A-F]{32}|[0-9a-fA-F]{16})$/,
);

export const SupplierPurchasableSkuCurrentPriceSchema = z.object({
  supplier_price_list_id: uuid,
  supplier_price_list_version: z.number().int().positive(),
  supplier_price_list_row_version: z.number().int().positive(),
  supplier_price_list_item_id: uuid,
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean(),
  effective_from: timestamp,
  effective_until: timestamp.nullable(),
}).strict();

export const SupplierPurchasableSkuPriceContextEnvelopeSchema = z.object({
  tenant_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  supplier_product_id: uuid,
  supplier_sku_id: uuid.nullable(),
  currency: z.literal("CNY"),
  recommended_tax_rate: taxRate,
  recommended_tax_inclusive: z.literal(false),
  next_scheduled_effective_from: timestamp.nullable(),
  current_price: SupplierPurchasableSkuCurrentPriceSchema.nullable(),
}).strict().refine(
  (value) => value.supplier_sku_id !== null || value.current_price === null,
  { message: "价格默认上下文不得返回当前 SKU 价格" },
);

export const SupplierPurchasableSkuIdentitySchema = z.object({
  id: uuid,
  supplier_id: uuid,
  supplier_product_id: uuid,
  ownership_scope: z.enum(["platform", "tenant"]),
  owner_tenant_id: uuid.nullable(),
  status: z.enum(SUPPLIER_SKU_STATUS_VALUES),
  version: z.number().int().positive(),
}).strict();

const SpecValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);
const commandRecordFields = {
  acting_tenant_id: uuid,
  acting_employee_id: uuid,
  operation_source: z.enum(["tenant", "tenant_proxy"]),
  proxy_reason: z.string().trim().min(1).nullable(),
  created_by_employee_id: uuid,
  updated_by_employee_id: uuid,
  created_at: timestamp,
  updated_at: timestamp,
};
const SupplierPurchasableSkuCommandProductSchema = z.object({
  id: uuid,
  supplier_id: uuid,
  product_code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category_id: uuid,
  brand_id: uuid,
  description: z.string().trim().min(1).nullable(),
  status: z.literal("active"),
  version: z.number().int().positive(),
  ownership_scope: z.literal("tenant"),
  owner_tenant_id: uuid,
  ...commandRecordFields,
}).strict();
const SupplierPurchasableSkuCommandSkuSchema = z.object({
  id: uuid,
  supplier_id: uuid,
  supplier_product_id: uuid,
  sku_code: tenantSkuCode,
  name: z.string().trim().min(1),
  specification: z.string().trim().min(1).nullable(),
  model: z.string().trim().min(1).nullable(),
  spec_values: z.record(z.string(), SpecValueSchema).nullable(),
  purchase_unit_id: uuid,
  base_unit_id: uuid,
  base_unit_conversion: z.number().finite().positive(),
  batch_managed: z.boolean(),
  color_managed: z.boolean(),
  serial_managed: z.boolean(),
  status: z.literal("active"),
  version: z.number().int().positive(),
  ownership_scope: z.literal("tenant"),
  owner_tenant_id: uuid,
  ...commandRecordFields,
}).strict();
const SupplierPurchasableSkuCatalogItemSchema = z.object({
  supplier_product_id: uuid,
  product_code: z.string().trim().min(1),
  product_name: z.string().trim().min(1),
  supplier_sku_id: uuid,
  sku_code: tenantSkuCode,
  sku_name: z.string().trim().min(1),
  specification: z.string().trim().min(1).nullable(),
  model: z.string().trim().min(1).nullable(),
  supplier_price_list_id: uuid,
  price_list_code: z.literal("DEFAULT"),
  price_list_version: z.number().int().positive(),
  effective_from: timestamp,
  effective_until: timestamp.nullable(),
  supplier_price_list_item_id: uuid,
  purchase_unit_id: uuid,
  purchase_unit_code: z.string().trim().min(1),
  purchase_unit_name: z.string().trim().min(1),
  purchase_unit_symbol: z.string().trim().min(1),
  base_unit_id: uuid,
  base_unit_code: z.string().trim().min(1),
  base_unit_name: z.string().trim().min(1),
  base_unit_symbol: z.string().trim().min(1),
  base_unit_conversion: z.string().regex(
    /^(?:0|[1-9]\d{0,9})(?:\.\d{1,8})?$/,
  ).refine((value) => !sameLimitedDecimal(value, "0")),
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean(),
}).strict();

export const SupplierPurchasableSkuCommandResultSchema = z.object({
  status: z.literal("saved"),
  idempotent: z.boolean(),
  price_version_created: z.boolean(),
  currency: z.literal("CNY"),
  product: SupplierPurchasableSkuCommandProductSchema,
  sku: SupplierPurchasableSkuCommandSkuSchema,
  current_price: SupplierPurchasableSkuCurrentPriceSchema,
  catalog_item: SupplierPurchasableSkuCatalogItemSchema,
  next_scheduled_effective_from: timestamp.nullable(),
  available_actions: z.tuple([z.literal("edit"), z.literal("deactivate")]),
}).strict().superRefine((result, context) => {
  const { product, sku, current_price: price, catalog_item: item } = result;
  const identitiesMatch = [
    validAuditFields(product),
    validAuditFields(sku),
    product.id === sku.supplier_product_id,
    product.id === item.supplier_product_id,
    product.supplier_id === sku.supplier_id,
    product.owner_tenant_id === sku.owner_tenant_id,
    product.acting_tenant_id === sku.acting_tenant_id,
    sku.id === item.supplier_sku_id,
    product.product_code === item.product_code,
    product.name === item.product_name,
    sku.sku_code === item.sku_code,
    sku.name === item.sku_name,
    sku.specification === item.specification,
    sku.model === item.model,
    price.supplier_price_list_id === item.supplier_price_list_id,
    price.supplier_price_list_item_id === item.supplier_price_list_item_id,
    price.supplier_price_list_version === item.price_list_version,
    sku.purchase_unit_id === item.purchase_unit_id,
    sku.base_unit_id === item.base_unit_id,
    sameLimitedDecimal(sku.base_unit_conversion, item.base_unit_conversion),
    sameLimitedDecimal(price.unit_price, item.unit_price),
    sameLimitedDecimal(price.tax_rate, item.tax_rate),
    price.tax_inclusive === item.tax_inclusive,
    price.effective_from === item.effective_from,
    price.effective_until === item.effective_until,
  ];
  const periodIsValid = price.effective_until === null ||
    Date.parse(price.effective_until) > Date.parse(price.effective_from);
  const nextPeriodIsValid = result.next_scheduled_effective_from === null ||
    (price.effective_until !== null &&
      Date.parse(price.effective_until) ===
        Date.parse(result.next_scheduled_effective_from));
  if (identitiesMatch.every(Boolean) && periodIsValid && nextPeriodIsValid) {
    return;
  }
  context.addIssue({ code: "custom", message: "供应商 SKU 命令响应关联不一致" });
});

function validAuditFields(record: {
  operation_source: "tenant" | "tenant_proxy";
  proxy_reason: string | null;
}): boolean {
  return record.operation_source === "tenant"
    ? record.proxy_reason === null
    : record.proxy_reason !== null;
}

export const SupplierPurchasableSkuCommandFailureSchema = z.object({
  status: z.enum([
    "validation_error", "not_found", "version_conflict", "state_conflict",
  ]),
  idempotent: z.literal(false),
  error_code: z.string().min(1),
  reason: z.string().min(1).optional(),
  version: z.number().int().positive().optional(),
  current_price_list_id: uuid.optional(),
  current_status: z.string().min(1).optional(),
}).strict();

export type SupplierPurchasableSkuPriceContext = {
  currency: "CNY";
  recommended_tax_rate: string;
  recommended_tax_inclusive: false;
  next_scheduled_effective_from: string | null;
  current_price: null | {
    supplier_price_list_id: string;
    supplier_price_list_version: number;
    supplier_price_list_row_version: number;
    supplier_price_list_item_id: string;
    unit_price: string;
    tax_rate: string;
    tax_inclusive: boolean;
    effective_from: string;
    effective_until: string | null;
  };
};

export type SupplierPurchasableSkuIdentity = z.infer<
  typeof SupplierPurchasableSkuIdentitySchema
>;
export type SupplierPurchasableSkuCommandResult = z.infer<
  typeof SupplierPurchasableSkuCommandResultSchema
>;
