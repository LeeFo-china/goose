import { z } from "zod";

export const SUPPLIER_PURCHASE_ORDER_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "tenant_supplier_id",
  "supplier_id",
  "order_no",
  "status",
  "currency",
  "expected_delivery_date",
  "remark",
  "priced_at",
  "subtotal_amount::text",
  "tax_amount::text",
  "total_amount::text",
  "version",
  "created_by_employee_id",
  "updated_by_employee_id",
  "submitted_by_employee_id",
  "submitted_at",
  "cancelled_by_employee_id",
  "cancelled_at",
  "cancel_reason",
  "created_at",
  "updated_at",
  "project:projects!project_id(id,name,status)",
  "supplier:suppliers!supplier_id(id,code,name,legal_name,onboarding_status,operational_status)",
].join(",");

export const SUPPLIER_PURCHASE_ORDER_ITEM_SELECT = [
  "id",
  "tenant_id",
  "supplier_id",
  "supplier_purchase_order_id",
  "line_no",
  "supplier_product_id",
  "supplier_sku_id",
  "supplier_price_list_id",
  "supplier_price_list_item_id",
  "product_code_snapshot",
  "product_name_snapshot",
  "sku_code_snapshot",
  "sku_name_snapshot",
  "specification_snapshot",
  "model_snapshot",
  "purchase_unit_id",
  "purchase_unit_code_snapshot",
  "purchase_unit_name_snapshot",
  "purchase_unit_symbol_snapshot",
  "base_unit_id",
  "base_unit_code_snapshot",
  "base_unit_name_snapshot",
  "base_unit_symbol_snapshot",
  "base_unit_conversion::text",
  "price_list_code_snapshot",
  "price_list_version_snapshot",
  "price_effective_from_snapshot",
  "price_effective_until_snapshot",
  "quantity::text",
  "unit_price::text",
  "tax_rate::text",
  "tax_inclusive",
  "subtotal_amount::text",
  "tax_amount::text",
  "total_amount::text",
  "created_at",
  "updated_at",
].join(",");

const uuid = z.uuid();
const dateTime = z.string();
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const orderStatus = z.enum(["draft", "submitted", "cancelled"]);

export const SupplierPurchaseOrderRecordSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  project_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  order_no: z.string().min(1),
  status: orderStatus,
  currency: z.literal("CNY"),
  expected_delivery_date: z.string().nullable(),
  remark: z.string().nullable(),
  priced_at: dateTime,
  subtotal_amount: decimal,
  tax_amount: decimal,
  total_amount: decimal,
  version: z.number().int().positive(),
  created_by_employee_id: uuid,
  updated_by_employee_id: uuid,
  submitted_by_employee_id: uuid.nullable(),
  submitted_at: dateTime.nullable(),
  cancelled_by_employee_id: uuid.nullable(),
  cancelled_at: dateTime.nullable(),
  cancel_reason: z.string().nullable(),
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

export const SupplierPurchaseOrderWithReferencesSchema =
  SupplierPurchaseOrderRecordSchema.extend({
    project: z.object({
      id: uuid,
      name: z.string(),
      status: z.string(),
    }).strict(),
    supplier: z.object({
      id: uuid,
      code: z.string(),
      name: z.string(),
      legal_name: z.string(),
      onboarding_status: z.enum([
        "draft",
        "pending_review",
        "approved",
        "rejected",
      ]),
      operational_status: z.enum(["active", "suspended", "blacklisted"]),
    }).strict(),
  }).strict();

export const SupplierPurchaseOrderItemSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  supplier_id: uuid,
  supplier_purchase_order_id: uuid,
  line_no: z.number().int().positive(),
  supplier_product_id: uuid,
  supplier_sku_id: uuid,
  supplier_price_list_id: uuid,
  supplier_price_list_item_id: uuid,
  product_code_snapshot: z.string(),
  product_name_snapshot: z.string(),
  sku_code_snapshot: z.string(),
  sku_name_snapshot: z.string(),
  specification_snapshot: z.string().nullable(),
  model_snapshot: z.string().nullable(),
  purchase_unit_id: uuid,
  purchase_unit_code_snapshot: z.string(),
  purchase_unit_name_snapshot: z.string(),
  purchase_unit_symbol_snapshot: z.string(),
  base_unit_id: uuid,
  base_unit_code_snapshot: z.string(),
  base_unit_name_snapshot: z.string(),
  base_unit_symbol_snapshot: z.string(),
  base_unit_conversion: decimal,
  price_list_code_snapshot: z.string(),
  price_list_version_snapshot: z.number().int().positive(),
  price_effective_from_snapshot: dateTime,
  price_effective_until_snapshot: dateTime.nullable(),
  quantity: decimal,
  unit_price: decimal,
  tax_rate: decimal,
  tax_inclusive: z.boolean(),
  subtotal_amount: decimal,
  tax_amount: decimal,
  total_amount: decimal,
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

export const SupplierPurchaseOrderCatalogItemSchema = z.object({
  supplier_product_id: uuid,
  product_code: z.string(),
  product_name: z.string(),
  supplier_sku_id: uuid,
  sku_code: z.string(),
  sku_name: z.string(),
  specification: z.string().nullable(),
  model: z.string().nullable(),
  supplier_price_list_id: uuid,
  price_list_code: z.string(),
  price_list_version: z.number().int().positive(),
  effective_from: dateTime,
  effective_until: dateTime.nullable(),
  supplier_price_list_item_id: uuid,
  purchase_unit_id: uuid,
  purchase_unit_code: z.string(),
  purchase_unit_name: z.string(),
  purchase_unit_symbol: z.string(),
  base_unit_id: uuid,
  base_unit_code: z.string(),
  base_unit_name: z.string(),
  base_unit_symbol: z.string(),
  base_unit_conversion: decimal,
  unit_price: decimal,
  tax_rate: decimal,
  tax_inclusive: z.boolean(),
}).strict();

export const SupplierPurchaseOrderCatalogResultSchema = z.object({
  items: z.array(SupplierPurchaseOrderCatalogItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive().max(100),
}).strict();

export const SupplierPurchaseOrderProjectOptionSchema = z.object({
  id: uuid,
  name: z.string(),
  status: z.string().nullable(),
}).strict();

export const SupplierPurchaseOrderSupplierOptionSchema = z.object({
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  relationship_status: z.literal("active"),
  default_currency: z.literal("CNY"),
  supplier: z.object({
    id: uuid,
    code: z.string(),
    name: z.string(),
    legal_name: z.string(),
  }).strict(),
}).strict();

export const SupplierPurchaseOrderSupplierOptionResultSchema = z.object({
  items: z.array(SupplierPurchaseOrderSupplierOptionSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive().max(100),
}).strict();

export const SupplierPurchaseOrderCommandEnvelopeSchema = z.object({
  status: z.enum([
    "saved",
    "submitted",
    "cancelled",
    "validation_error",
    "not_found",
    "version_conflict",
    "state_conflict",
    "price_missing",
    "price_changed",
    "supplier_not_eligible",
    "project_invalid",
  ]),
  idempotent: z.boolean().optional(),
  purchase_order: SupplierPurchaseOrderRecordSchema.optional(),
  version: z.number().int().nonnegative().optional(),
  error_code: z.string().optional(),
  reason: z.string().optional(),
  blocking_reasons: z.array(z.string()).optional(),
}).strict();

export type SupplierPurchaseOrder =
  z.infer<typeof SupplierPurchaseOrderRecordSchema>;
export type SupplierPurchaseOrderWithReferences =
  z.infer<typeof SupplierPurchaseOrderWithReferencesSchema>;
export type SupplierPurchaseOrderItem =
  z.infer<typeof SupplierPurchaseOrderItemSchema>;
export type SupplierPurchaseOrderCatalogItem =
  z.infer<typeof SupplierPurchaseOrderCatalogItemSchema>;
export type SupplierPurchaseOrderProjectOption =
  z.infer<typeof SupplierPurchaseOrderProjectOptionSchema>;
export type SupplierPurchaseOrderSupplierOption =
  z.infer<typeof SupplierPurchaseOrderSupplierOptionSchema>;
