import { SUPPLIER_SKU_STATUS_VALUES } from "@gooes/domain";
import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso.datetime({ offset: true });
const unitPrice = z.string().regex(
  /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/,
).refine((value) => value !== "0" && !/^0\.0+$/.test(value));
const taxRate = z.string().regex(
  /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/,
);

const SupplierPurchasableSkuCurrentPriceSchema = z.object({
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
