import { z } from "zod";

import {
  SupplierPurchaseRequisitionBudgetStatusSchema,
  SupplierPurchaseRequisitionStatusSchema,
} from "@/schema/supplier-purchase-requisitions";
import {
  ProcurementDestinationRecordSchema,
  ProcurementDestinationRelationSchema,
  type ProjectProcurementDestinationRecord,
} from "./procurement-destination-records";

export const SUPPLIER_PURCHASE_REQUISITION_SELECT = [
  "id",
  "tenant_id",
  "request_no",
  "project_id",
  "destination_type",
  "warehouse_id",
  "tenant_supplier_id",
  "supplier_id",
  "status",
  "budget_status",
  "currency",
  "reason",
  "expected_delivery_date",
  "remark",
  "priced_at",
  "subtotal_amount::text",
  "tax_amount::text",
  "total_amount::text",
  "purchase_order_id",
  "purchase_batch_id",
  "split_generation",
  "version",
  "created_by_employee_id",
  "updated_by_employee_id",
  "submitted_by_employee_id",
  "submitted_at",
  "reviewed_by_employee_id",
  "reviewed_at",
  "review_remark",
  "cancelled_by_employee_id",
  "cancelled_at",
  "cancel_reason",
  "created_at",
  "updated_at",
  "project:projects!supplier_purchase_requisitions_project_tenant_fkey(id,name,status)",
  "warehouse:warehouses!supplier_purchase_requisitions_warehouse_tenant_fkey(id,name,status)",
].join(",");

export const SUPPLIER_PURCHASE_REQUISITION_SCOPE_SELECT = [
  "id",
  "project_id",
  "destination_type",
  "warehouse_id",
  "tenant_supplier_id",
  "created_by_employee_id",
  "budget_status",
  "status",
  "version",
].join(",");

export const SUPPLIER_PURCHASE_REQUISITION_ITEM_SELECT = [
  "id",
  "tenant_id",
  "purchase_requisition_id",
  "line_no",
  "cost_category_id",
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
  "line_subtotal_amount::text",
  "line_tax_amount::text",
  "line_total_amount::text",
  "created_at",
].join(",");

export const PROJECT_COST_COMMITMENT_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "cost_category_id",
  "source_type",
  "source_id",
  "amount::text",
  "status",
  "budget_amount_snapshot::text",
  "expense_amount_snapshot::text",
  "other_commitment_amount_snapshot::text",
  "available_amount_snapshot::text",
  "created_by_employee_id",
  "released_by_employee_id",
  "released_at",
  "release_reason",
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
  signed?: boolean;
  positive?: boolean;
}) {
  const sign = input.signed ? "-?" : "";
  const pattern = new RegExp(
    `^${sign}\\d+(?:\\.\\d{1,${input.scale}})?$`,
  );
  return z.string().regex(pattern).refine((value) => {
    const unsigned = value.startsWith("-") ? value.slice(1) : value;
    const [integerPart = "0"] = unsigned.split(".");
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "");
    return normalizedInteger.length <= input.integerDigits;
  }, "数值超过数据库上限").refine(
    (value) => !input.positive || /[1-9]/.test(value),
    "数值必须大于 0",
  );
}

const money = decimalString({ integerDigits: 16, scale: 2 });
const signedMoney = decimalString({
  integerDigits: 16,
  scale: 2,
  signed: true,
});
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
const taxRate = decimalString({ integerDigits: 1, scale: 6 }).refine((value) => {
  const [integerPart = "0", fractionPart] = value.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "");
  return normalizedInteger === "0" ||
    (normalizedInteger === "1" && !/[1-9]/.test(fractionPart ?? ""));
}, "税率必须在 0 到 1 之间");

export const SupplierPurchaseRequisitionRecordSchema =
  ProcurementDestinationRecordSchema.safeExtend({
  id: uuid,
  tenant_id: uuid,
  request_no: z.string().regex(/^PR-\d{8}-\d{8}$/),
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  status: SupplierPurchaseRequisitionStatusSchema,
  budget_status: SupplierPurchaseRequisitionBudgetStatusSchema,
  currency: z.literal("CNY"),
  reason: z.string().trim().min(1).max(500),
  expected_delivery_date: date.nullable(),
  remark: z.string().max(500).nullable(),
  priced_at: dateTime,
  subtotal_amount: money,
  tax_amount: money,
  total_amount: money,
  purchase_order_id: uuid.nullable(),
  purchase_batch_id: uuid.nullable(),
  split_generation: z.number().int().positive().nullable(),
  version: z.number().int().positive(),
  created_by_employee_id: uuid,
  updated_by_employee_id: uuid,
  submitted_by_employee_id: nullableEmployeeId,
  submitted_at: nullableDateTime,
  reviewed_by_employee_id: nullableEmployeeId,
  reviewed_at: nullableDateTime,
  review_remark: z.string().max(500).nullable(),
  cancelled_by_employee_id: nullableEmployeeId,
  cancelled_at: nullableDateTime,
  cancel_reason: z.string().max(500).nullable(),
  created_at: dateTime,
  updated_at: dateTime,
  project: ProcurementDestinationRelationSchema.nullable().default(null),
  warehouse: ProcurementDestinationRelationSchema.nullable().default(null),
}).strict().superRefine((record, context) => {
  if ((record.purchase_batch_id === null) === (record.split_generation === null)) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: ["purchase_batch_id"],
    message: "采购批次归属与拆单代次必须同时存在",
  });
});

export const SupplierPurchaseRequisitionScopeSchema =
  ProcurementDestinationRecordSchema.safeExtend({
  id: uuid,
  tenant_supplier_id: uuid,
  created_by_employee_id: uuid,
  budget_status: SupplierPurchaseRequisitionBudgetStatusSchema,
  status: SupplierPurchaseRequisitionStatusSchema,
  version: z.number().int().positive(),
}).strict();

export const SupplierPurchaseRequisitionItemSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  purchase_requisition_id: uuid,
  line_no: z.number().int().positive(),
  cost_category_id: uuid,
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
  base_unit_conversion: conversion,
  price_list_code_snapshot: z.string(),
  price_list_version_snapshot: z.number().int().positive(),
  price_effective_from_snapshot: dateTime,
  price_effective_until_snapshot: nullableDateTime,
  quantity,
  unit_price: unitPrice,
  tax_rate: taxRate,
  tax_inclusive: z.boolean(),
  line_subtotal_amount: money,
  line_tax_amount: money,
  line_total_amount: money,
  created_at: dateTime,
}).strict();

export const ProjectCostCommitmentStatusSchema = z.enum([
  "reserved",
  "converted",
  "released",
]);

export const ProjectCostCommitmentRecordSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  project_id: uuid,
  cost_category_id: uuid,
  source_type: z.literal("supplier_purchase_requisition"),
  source_id: uuid,
  amount: money,
  status: ProjectCostCommitmentStatusSchema,
  budget_amount_snapshot: money,
  expense_amount_snapshot: money,
  other_commitment_amount_snapshot: money,
  available_amount_snapshot: signedMoney,
  created_by_employee_id: uuid,
  released_by_employee_id: nullableEmployeeId,
  released_at: nullableDateTime,
  release_reason: z.string().max(500).nullable(),
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

export const SupplierPurchaseRequisitionBudgetSnapshotSchema =
  ProjectCostCommitmentRecordSchema;

export const SupplierPurchaseRequisitionDetailSchema = z.object({
  requisition: SupplierPurchaseRequisitionRecordSchema,
  budget_snapshots: z.array(ProjectCostCommitmentRecordSchema).max(100),
}).strict();

export const SupplierPurchaseRequisitionItemPageSchema = z.object({
  list: z.array(SupplierPurchaseRequisitionItemSchema).max(100),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const SupplierPurchaseRequisitionCommandStatusSchema = z.enum([
  "saved",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
  "converted",
  "validation_error",
  "not_found",
  "version_conflict",
  "state_conflict",
  "price_missing",
  "price_changed",
  "supplier_not_eligible",
  "project_invalid",
  "self_review",
  "idempotency_conflict",
]);

export const SupplierPurchaseRequisitionCommandEnvelopeSchema = z.object({
  status: SupplierPurchaseRequisitionCommandStatusSchema,
  idempotent: z.boolean().optional(),
  requisition: SupplierPurchaseRequisitionRecordSchema.optional(),
  purchase_order_id: uuid.optional(),
  version: z.number().int().positive().optional(),
  error_code: z.string().optional(),
  reason: z.string().optional(),
}).strict();

export type SupplierPurchaseRequisitionRecord =
  z.infer<typeof SupplierPurchaseRequisitionRecordSchema> &
    ProjectProcurementDestinationRecord;
export type SupplierPurchaseRequisitionScope =
  z.infer<typeof SupplierPurchaseRequisitionScopeSchema> &
    ProjectProcurementDestinationRecord;
export type SupplierPurchaseRequisitionItem =
  z.infer<typeof SupplierPurchaseRequisitionItemSchema>;
export type ProjectCostCommitmentStatus =
  z.infer<typeof ProjectCostCommitmentStatusSchema>;
export type ProjectCostCommitmentRecord =
  z.infer<typeof ProjectCostCommitmentRecordSchema>;
export type SupplierPurchaseRequisitionBudgetSnapshot =
  z.infer<typeof SupplierPurchaseRequisitionBudgetSnapshotSchema>;
export type SupplierPurchaseRequisitionDetail =
  Omit<z.infer<typeof SupplierPurchaseRequisitionDetailSchema>, "requisition"> & {
    requisition: SupplierPurchaseRequisitionRecord;
  };
export type SupplierPurchaseRequisitionItemPage =
  z.infer<typeof SupplierPurchaseRequisitionItemPageSchema>;
export type SupplierPurchaseRequisitionCommandStatus =
  z.infer<typeof SupplierPurchaseRequisitionCommandStatusSchema>;
export type SupplierPurchaseRequisitionCommandEnvelope =
  z.infer<typeof SupplierPurchaseRequisitionCommandEnvelopeSchema>;
