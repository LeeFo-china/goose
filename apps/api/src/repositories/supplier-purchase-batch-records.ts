import { z } from "zod";

import { SupplierPurchaseBatchStatusSchema } from "@/schema/supplier-purchase-batches";
import {
  SupplierPurchaseOrderCatalogItemSchema,
  SupplierPurchaseOrderWithReferencesSchema,
} from "./supplier-purchase-order-records";
import {
  NullableSupplierPurchaseEmployeeSnapshotSchema,
} from "./supplier-purchase-personnel-records";
import {
  ProcurementDestinationRecordSchema,
  ProcurementDestinationRelationSchema,
  type ProjectProcurementDestinationRecord,
} from "./procurement-destination-records";
import { SupplierPurchaseRequisitionRecordSchema } from "./supplier-purchase-requisition-records";

export const SUPPLIER_PURCHASE_BATCH_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "destination_type",
  "warehouse_id",
  "batch_no",
  "status",
  "reason",
  "expected_delivery_date",
  "remark",
  "priced_at",
  "currency",
  "subtotal_amount::text",
  "tax_amount::text",
  "total_amount::text",
  "budget_checked_at",
  "budget_status",
  "budget_snapshot",
  "split_generation",
  "supplier_count",
  "item_count",
  "approval_round",
  "version",
  "created_by_employee_id",
  "creator_snapshot",
  "updated_by_employee_id",
  "submitted_by_employee_id",
  "submitted_at",
  "applicant_snapshot",
  "reviewed_by_employee_id",
  "reviewed_at",
  "last_reviewer_snapshot",
  "review_remark",
  "cancelled_by_employee_id",
  "cancelled_at",
  "cancel_reason",
  "created_at",
  "updated_at",
  "project:projects!supplier_purchase_batches_project_tenant_fkey(id,name,status)",
  "warehouse:warehouses!supplier_purchase_batches_warehouse_tenant_fkey(id,name,status)",
].join(",");

export const SUPPLIER_PURCHASE_BATCH_ITEM_SELECT = [
  "id",
  "tenant_id",
  "purchase_batch_id",
  "line_no",
  "supplier_sku_id",
  "quantity::text",
  "cost_category_id",
  "supplier_id",
  "tenant_supplier_id",
  "supplier_product_id",
  "supplier_price_list_id",
  "supplier_price_list_item_id",
  "catalog_category_id",
  "category_name_snapshot",
  "brand_id",
  "brand_name_snapshot",
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
  "supplier_name_snapshot",
  "price_list_code_snapshot",
  "price_list_version_snapshot",
  "price_effective_from_snapshot",
  "price_effective_until_snapshot",
  "priced_at",
  "unit_price::text",
  "tax_rate::text",
  "tax_inclusive",
  "line_subtotal_amount::text",
  "line_tax_amount::text",
  "line_total_amount::text",
  "created_at",
  "updated_at",
].join(",");

const uuid = z.uuid();
const date = z.iso.date();
const dateTime = z.iso.datetime({ offset: true });
const nullableEmployeeId = uuid.nullable();
const nullableDateTime = dateTime.nullable();

function decimalString(input: {
  integerDigits: number;
  scale: number;
  positive?: boolean;
}) {
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${input.scale}})?$`);
  return z.string().regex(pattern).refine((value) => {
    const [integerPart = "0"] = value.split(".");
    return integerPart.replace(/^0+(?=\d)/, "").length <= input.integerDigits;
  }, "数值超过数据库上限").refine(
    (value) => !input.positive || /[1-9]/.test(value),
    "数值必须大于 0",
  );
}

const money = decimalString({ integerDigits: 16, scale: 2 });
const signedMoney = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/).refine(
  (value) => {
    const [integerPart = "0"] = value.replace(/^-/, "").split(".");
    return integerPart.replace(/^0+(?=\d)/, "").length <= 16;
  },
  "数值超过数据库上限",
);
const quantity = decimalString({
  integerDigits: 14,
  scale: 4,
  positive: true,
});
const conversion = decimalString({
  integerDigits: 10,
  scale: 8,
  positive: true,
});
const unitPrice = decimalString({ integerDigits: 12, scale: 2 });
const taxRate = decimalString({ integerDigits: 1, scale: 6 }).refine(
  (value) => Number(value) <= 1,
  "税率必须在 0 到 1 之间",
);

const SupplierPurchaseBatchBudgetSnapshotEntrySchema = z.object({
  requested_amount: money,
  budget_amount: money,
  expense_amount: money,
  other_commitment_amount: money,
  available_amount: signedMoney,
}).strict();

export const SupplierPurchaseBatchRecordSchema =
  ProcurementDestinationRecordSchema.safeExtend({
  id: uuid,
  tenant_id: uuid,
  batch_no: z.string().regex(/^PB-\d{8}-\d{8}$/),
  status: SupplierPurchaseBatchStatusSchema,
  reason: z.string().trim().min(1).max(500),
  expected_delivery_date: date.nullable(),
  remark: z.string().trim().min(1).max(500).nullable(),
  priced_at: dateTime,
  currency: z.literal("CNY"),
  subtotal_amount: money,
  tax_amount: money,
  total_amount: money,
  budget_checked_at: nullableDateTime,
  budget_status: z.enum(["unchecked", "within_budget", "over_budget"]),
  budget_snapshot: z.record(
    uuid,
    SupplierPurchaseBatchBudgetSnapshotEntrySchema,
  ),
  split_generation: z.number().int().nonnegative(),
  supplier_count: z.number().int().min(0).max(20),
  item_count: z.number().int().min(0).max(100),
  approval_round: z.number().int().nonnegative().optional(),
  version: z.number().int().positive(),
  created_by_employee_id: uuid,
  creator_snapshot: NullableSupplierPurchaseEmployeeSnapshotSchema.optional(),
  updated_by_employee_id: uuid,
  submitted_by_employee_id: nullableEmployeeId,
  submitted_at: nullableDateTime,
  applicant_snapshot: NullableSupplierPurchaseEmployeeSnapshotSchema.optional(),
  reviewed_by_employee_id: nullableEmployeeId,
  reviewed_at: nullableDateTime,
  last_reviewer_snapshot:
    NullableSupplierPurchaseEmployeeSnapshotSchema.optional(),
  review_remark: z.string().trim().min(1).max(500).nullable(),
  cancelled_by_employee_id: nullableEmployeeId,
  cancelled_at: nullableDateTime,
  cancel_reason: z.string().trim().min(1).max(500).nullable(),
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

export const SupplierPurchaseBatchDetailSchema =
  SupplierPurchaseBatchRecordSchema.extend({
    project: ProcurementDestinationRelationSchema.nullable().default(null),
    warehouse: ProcurementDestinationRelationSchema.nullable().default(null),
  }).strict();

export const SupplierPurchaseBatchItemSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  purchase_batch_id: uuid,
  line_no: z.number().int().min(1).max(100),
  supplier_sku_id: uuid,
  quantity,
  cost_category_id: uuid,
  supplier_id: uuid,
  tenant_supplier_id: uuid,
  supplier_product_id: uuid,
  supplier_price_list_id: uuid,
  supplier_price_list_item_id: uuid,
  catalog_category_id: uuid,
  category_name_snapshot: z.string().min(1),
  brand_id: uuid,
  brand_name_snapshot: z.string().min(1),
  product_code_snapshot: z.string().min(1),
  product_name_snapshot: z.string().min(1),
  sku_code_snapshot: z.string().min(1),
  sku_name_snapshot: z.string().min(1),
  specification_snapshot: z.string().nullable(),
  model_snapshot: z.string().nullable(),
  purchase_unit_id: uuid,
  purchase_unit_code_snapshot: z.string().min(1),
  purchase_unit_name_snapshot: z.string().min(1),
  purchase_unit_symbol_snapshot: z.string().min(1),
  base_unit_id: uuid,
  base_unit_code_snapshot: z.string().min(1),
  base_unit_name_snapshot: z.string().min(1),
  base_unit_symbol_snapshot: z.string().min(1),
  base_unit_conversion: conversion,
  supplier_name_snapshot: z.string().min(1),
  price_list_code_snapshot: z.string().min(1),
  price_list_version_snapshot: z.number().int().positive(),
  price_effective_from_snapshot: dateTime,
  price_effective_until_snapshot: nullableDateTime,
  priced_at: dateTime,
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean(),
  line_subtotal_amount: money,
  line_tax_amount: money,
  line_total_amount: money,
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

export const SupplierPurchaseBatchCatalogBaseItemSchema =
  SupplierPurchaseOrderCatalogItemSchema.extend({
    category_id: uuid,
    category_name: z.string().min(1),
    brand_id: uuid,
    brand_name: z.string().min(1),
    tenant_supplier_id: uuid,
    supplier_id: uuid,
    supplier_name: z.string().min(1),
    base_unit_conversion: conversion,
    unit_price: unitPrice,
    tax_rate: taxRate,
    currency: z.literal("CNY"),
    purchasable_status: z.literal("purchasable"),
  }).strict();

export const SupplierPurchaseBatchCatalogItemSchema =
  SupplierPurchaseBatchCatalogBaseItemSchema.extend({
    default_cost_category_id: uuid.nullable(),
    default_cost_category_name: z.string().min(1).nullable(),
    cost_category_source: z.enum([
      "product",
      "category",
      "ancestor",
    ]).nullable(),
  }).strict();

export const SupplierSkuCostCategoryDefaultSchema = z.object({
  supplier_sku_id: uuid,
  cost_category_id: uuid,
  cost_category_name: z.string().min(1),
  source: z.enum(["product", "category", "ancestor"]),
}).strict();

export const SupplierPurchaseBatchCatalogResultSchema = z.object({
  items: z.array(SupplierPurchaseBatchCatalogBaseItemSchema).max(100),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive().max(100),
}).strict();

export const SupplierPurchaseBatchRequisitionSchema =
  SupplierPurchaseRequisitionRecordSchema.safeExtend({
    purchase_batch_id: uuid,
    split_generation: z.number().int().positive(),
  }).strict();

export const SupplierPurchaseBatchOrderSchema =
  SupplierPurchaseOrderWithReferencesSchema.safeExtend({
    purchase_batch_id: uuid,
    subtotal_amount: money,
    tax_amount: money,
    total_amount: money,
  }).strict();

export const SupplierPurchaseBatchProjectOptionSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  status: z.string().nullable(),
}).strict();

export const SupplierPurchaseBatchCostCategorySchema = z.object({
  id: uuid,
  code: z.string().min(1),
  name: z.string().min(1),
  status: z.literal("active"),
  sort_order: z.number().int(),
}).strict();

export const SupplierPurchaseBatchSplitPreviewSchema = z.object({
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  supplier_name: z.string().min(1),
  item_count: z.number().int().min(1).max(100),
  subtotal_amount: money,
  tax_amount: money,
  total_amount: money,
}).strict().refine(
  (preview) => moneyToMinor(preview.subtotal_amount) +
    moneyToMinor(preview.tax_amount) === moneyToMinor(preview.total_amount),
  "供应商拆单预览金额不一致",
);

function moneyToMinor(value: string): bigint {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer) * BigInt(100) +
    BigInt(fraction.padEnd(2, "0"));
}

export type SupplierPurchaseBatch =
  z.infer<typeof SupplierPurchaseBatchRecordSchema> &
    ProjectProcurementDestinationRecord;
export type SupplierPurchaseBatchDetail =
  z.infer<typeof SupplierPurchaseBatchDetailSchema> &
    ProjectProcurementDestinationRecord;
export type SupplierPurchaseBatchItem =
  z.infer<typeof SupplierPurchaseBatchItemSchema>;
export type SupplierPurchaseBatchCatalogItem =
  z.infer<typeof SupplierPurchaseBatchCatalogItemSchema>;
export type SupplierSkuCostCategoryDefault =
  z.infer<typeof SupplierSkuCostCategoryDefaultSchema>;
export type SupplierPurchaseBatchRequisition =
  z.infer<typeof SupplierPurchaseBatchRequisitionSchema>;
export type SupplierPurchaseBatchOrder =
  z.infer<typeof SupplierPurchaseBatchOrderSchema>;
export type SupplierPurchaseBatchProjectOption =
  z.infer<typeof SupplierPurchaseBatchProjectOptionSchema>;
export type SupplierPurchaseBatchCostCategory =
  z.infer<typeof SupplierPurchaseBatchCostCategorySchema>;
export type SupplierPurchaseBatchSplitPreview =
  z.infer<typeof SupplierPurchaseBatchSplitPreviewSchema>;
