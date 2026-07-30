import { z } from "zod";

import {
  SupplierPurchaseRequisitionBudgetStatusSchema,
  SupplierPurchaseRequisitionStatusSchema,
} from "@/schema/supplier-purchase-requisitions";

export const SUPPLIER_PURCHASE_REQUISITION_SELECT = [
  "id",
  "tenant_id",
  "request_no",
  "project_id",
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
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const signedDecimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const nullableEmployeeId = uuid.nullable();
const nullableDateTime = dateTime.nullable();

export const SupplierPurchaseRequisitionRecordSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  request_no: z.string().regex(/^PR-\d{8}-\d{8}$/),
  project_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  status: SupplierPurchaseRequisitionStatusSchema,
  budget_status: SupplierPurchaseRequisitionBudgetStatusSchema,
  currency: z.literal("CNY"),
  reason: z.string().trim().min(1).max(500),
  expected_delivery_date: date.nullable(),
  remark: z.string().max(500).nullable(),
  priced_at: dateTime,
  subtotal_amount: decimal,
  tax_amount: decimal,
  total_amount: decimal,
  purchase_order_id: uuid.nullable(),
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
  base_unit_conversion: decimal,
  price_list_code_snapshot: z.string(),
  price_list_version_snapshot: z.number().int().positive(),
  price_effective_from_snapshot: dateTime,
  price_effective_until_snapshot: nullableDateTime,
  quantity: decimal,
  unit_price: decimal,
  tax_rate: decimal,
  tax_inclusive: z.boolean(),
  line_subtotal_amount: decimal,
  line_tax_amount: decimal,
  line_total_amount: decimal,
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
  amount: decimal,
  status: ProjectCostCommitmentStatusSchema,
  budget_amount_snapshot: decimal,
  expense_amount_snapshot: decimal,
  other_commitment_amount_snapshot: decimal,
  available_amount_snapshot: signedDecimal,
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
  items: z.array(SupplierPurchaseRequisitionItemSchema).max(100),
  budget_snapshots: z.array(ProjectCostCommitmentRecordSchema).max(100),
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
  z.infer<typeof SupplierPurchaseRequisitionRecordSchema>;
export type SupplierPurchaseRequisitionItem =
  z.infer<typeof SupplierPurchaseRequisitionItemSchema>;
export type ProjectCostCommitmentStatus =
  z.infer<typeof ProjectCostCommitmentStatusSchema>;
export type ProjectCostCommitmentRecord =
  z.infer<typeof ProjectCostCommitmentRecordSchema>;
export type SupplierPurchaseRequisitionBudgetSnapshot =
  z.infer<typeof SupplierPurchaseRequisitionBudgetSnapshotSchema>;
export type SupplierPurchaseRequisitionDetail =
  z.infer<typeof SupplierPurchaseRequisitionDetailSchema>;
export type SupplierPurchaseRequisitionCommandStatus =
  z.infer<typeof SupplierPurchaseRequisitionCommandStatusSchema>;
export type SupplierPurchaseRequisitionCommandEnvelope =
  z.infer<typeof SupplierPurchaseRequisitionCommandEnvelopeSchema>;
