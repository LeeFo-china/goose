import { z } from "zod";

import {
  SupplierPurchaseBatchRecordSchema,
  SupplierPurchaseBatchSplitPreviewSchema,
  type SupplierPurchaseBatch,
  type SupplierPurchaseBatchSplitPreview,
} from "./supplier-purchase-batch-records";

const uuid = z.uuid();
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const signedMoney = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/);
const unitPrice = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const uniqueIds = z.array(uuid).min(1).max(20).refine(
  (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
  "采购申请 ID 不得重复",
);
// Two reasons per 20 suppliers, plus price, three item-reason sets, and
// budget blockers for each of the at most 100 batch items/categories.
const MAX_REVISION_BLOCKERS = 20 * 2 + 100 * 5;

export const SupplierPurchaseBatchPriceBlockerSchema = z.object({
  kind: z.literal("price"),
  supplier_sku_id: uuid,
  product_name: z.string().min(1),
  sku_name: z.string().min(1),
  frozen_unit_price: unitPrice,
  current_unit_price: unitPrice.nullable(),
  frozen_price_version: z.number().int().positive(),
  current_price_version: z.number().int().positive().nullable(),
}).strict();

export const SupplierPurchaseBatchBudgetBlockerSchema = z.object({
  kind: z.literal("budget"),
  cost_category_id: uuid,
  submitted_requested_amount: money,
  current_requested_amount: money,
  submitted_available_amount: signedMoney,
  current_available_amount: signedMoney,
}).strict();

export const SupplierPurchaseBatchSupplierBlockerSchema = z.object({
  kind: z.literal("supplier"),
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  reason: z.string().trim().min(1).max(100),
}).strict();

export const SupplierPurchaseBatchItemBlockerSchema = z.object({
  kind: z.literal("item"),
  supplier_sku_id: uuid,
  reason: z.string().trim().min(1).max(100),
}).strict();

export const SupplierPurchaseBatchBlockerSchema = z.discriminatedUnion(
  "kind",
  [
    SupplierPurchaseBatchPriceBlockerSchema,
    SupplierPurchaseBatchBudgetBlockerSchema,
    SupplierPurchaseBatchSupplierBlockerSchema,
    SupplierPurchaseBatchItemBlockerSchema,
  ],
);

export const SupplierPurchaseBatchOrderSummarySchema = z.object({
  id: uuid,
  order_no: z.string().regex(/^PO-\d{8}-\d{8}$/),
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  supplier_name: z.string().trim().min(1),
  status: z.literal("submitted"),
}).strict();

const ERROR_CODES_BY_STATUS: Record<string, ReadonlySet<string>> = {
  validation_error: new Set([
    "SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR",
    "SUPPLIER_PURCHASE_BATCH_DUPLICATE_SKU",
    "SUPPLIER_PURCHASE_BATCH_LIMIT_EXCEEDED",
  ]),
  not_found: new Set(["SUPPLIER_PURCHASE_BATCH_NOT_FOUND"]),
  version_conflict: new Set(["SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT"]),
  state_conflict: new Set([
    "SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT",
    "SUPPLIER_PURCHASE_BATCH_ID_CONFLICT",
    "SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED",
    "SUPPLIER_PURCHASE_BATCH_BUDGET_OVERRIDE_REQUIRED",
    "SUPPLIER_PURCHASE_BATCH_SELF_REVIEW",
  ]),
  price_changed: new Set([
    "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
    "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
  ]),
  supplier_not_eligible: new Set([
    "SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE",
  ]),
  project_invalid: new Set(["SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID"]),
};
export const SupplierPurchaseBatchRevisionErrorCodeSchema = z.enum([
  "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
  "SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED",
  "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
  "SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE",
]);
const REVISION_KIND_BY_CODE = {
  SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE: "supplier",
  SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED: "price",
  SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE: "item",
  SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED: "budget",
} as const;
const VERSION_ZERO_ERROR_CODES = new Set([
  "SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR",
  "SUPPLIER_PURCHASE_BATCH_DUPLICATE_SKU",
  "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
  "SUPPLIER_PURCHASE_BATCH_ID_CONFLICT",
]);

export const SupplierPurchaseBatchCommandEnvelopeSchema = z.object({
  status: z.enum([
    "saved", "submitted", "rejected", "cancelled", "ordered",
    "revision_required", "validation_error", "not_found",
    "version_conflict", "state_conflict", "price_changed",
    "supplier_not_eligible", "project_invalid",
  ]),
  idempotent: z.boolean(),
  batch: SupplierPurchaseBatchRecordSchema.optional(),
  requisition_ids: uniqueIds.optional(),
  orders: z.array(SupplierPurchaseBatchOrderSummarySchema)
    .min(1).max(20).superRefine(uniqueOrders).optional(),
  split_preview: z.array(SupplierPurchaseBatchSplitPreviewSchema)
    .min(1).max(20).optional(),
  details: z.array(SupplierPurchaseBatchBlockerSchema)
    .min(1).max(MAX_REVISION_BLOCKERS).optional(),
  version: z.number().int().nonnegative().optional(),
  error_code: z.string().optional(),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict().superRefine(validateEnvelope);

function uniqueOrders(
  orders: Array<z.infer<typeof SupplierPurchaseBatchOrderSummarySchema>>,
  context: z.RefinementCtx,
) {
  const ids = orders.map((order) => order.id.toLowerCase());
  const relationships = orders.map(
    (order) => order.tenant_supplier_id.toLowerCase(),
  );
  if (new Set(ids).size !== ids.length ||
    new Set(relationships).size !== relationships.length) {
    context.addIssue({ code: "custom", message: "采购单摘要不得重复" });
  }
}

function validateEnvelope(
  envelope: z.infer<typeof commandEnvelopeShape>,
  context: z.RefinementCtx,
) {
  const success = ["saved", "submitted", "rejected", "cancelled", "ordered"]
    .includes(envelope.status);
  const revision = envelope.status === "revision_required";
  if ((success || revision) && (!envelope.batch || !envelope.version)) {
    issue(context, "批次命令缺少持久结果");
  }
  if (success && (envelope.error_code || envelope.reason || envelope.details)) {
    issue(context, "无效的批次命令成功响应");
  }
  if (revision) {
    const code = SupplierPurchaseBatchRevisionErrorCodeSchema
      .safeParse(envelope.error_code);
    if (!code.success || !envelope.details || envelope.batch?.status !== "draft" ||
      envelope.details[0]?.kind !== REVISION_KIND_BY_CODE[code.data]) {
      issue(context, "无效的批次修订响应");
    }
  }
  if (!success && !revision && (!envelope.error_code ||
    envelope.version === undefined || envelope.batch || envelope.requisition_ids ||
    envelope.orders || envelope.split_preview)) {
    issue(context, "无效的批次命令错误响应");
  }
  validateSuccessFields(envelope, context);
  validateErrorCode(envelope, success, revision, context);
}

const commandEnvelopeShape = z.object({
  status: z.string(), idempotent: z.boolean(),
  batch: SupplierPurchaseBatchRecordSchema.optional(),
  requisition_ids: uniqueIds.optional(),
  orders: z.array(SupplierPurchaseBatchOrderSummarySchema).optional(),
  split_preview: z.array(SupplierPurchaseBatchSplitPreviewSchema).optional(),
  details: z.array(SupplierPurchaseBatchBlockerSchema).optional(),
  version: z.number().optional(), error_code: z.string().optional(),
  reason: z.string().optional(),
});

function validateSuccessFields(
  envelope: z.infer<typeof commandEnvelopeShape>,
  context: z.RefinementCtx,
) {
  const split = envelope.status === "saved";
  const submitted = envelope.status === "submitted";
  const ordered = envelope.status === "ordered";
  if (split !== Boolean(envelope.split_preview) ||
    (submitted || ordered) !== Boolean(envelope.requisition_ids) ||
    ordered !== Boolean(envelope.orders)) issue(context, "无效的批次命令字段");
  if (split && envelope.batch && envelope.split_preview &&
    !validPreview(envelope.batch, envelope.split_preview)) {
    issue(context, "批次拆单预览汇总不一致");
  }
  if (ordered && envelope.batch &&
    (envelope.orders?.length !== envelope.batch.supplier_count ||
      envelope.requisition_ids?.length !== envelope.batch.supplier_count)) {
    issue(context, "批次下单摘要数量不一致");
  }
}

function validateErrorCode(
  envelope: z.infer<typeof commandEnvelopeShape>,
  success: boolean,
  revision: boolean,
  context: z.RefinementCtx,
) {
  if (success || revision) return;
  const legalCodes = ERROR_CODES_BY_STATUS[envelope.status];
  if (!envelope.error_code || !legalCodes?.has(envelope.error_code)) {
    issue(context, "无效的批次命令错误码");
  }
  if (envelope.error_code && envelope.version !== undefined &&
    ((VERSION_ZERO_ERROR_CODES.has(envelope.error_code) && envelope.version !== 0) ||
      (!VERSION_ZERO_ERROR_CODES.has(envelope.error_code) && envelope.version <= 0))) {
    issue(context, "无效的批次命令版本");
  }
  const needsDetails = envelope.status === "price_changed" &&
    envelope.error_code === "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED";
  if (needsDetails !== Boolean(envelope.details)) issue(context, "无效的变价明细");
}

function validPreview(
  batch: z.infer<typeof SupplierPurchaseBatchRecordSchema>,
  preview: SupplierPurchaseBatchSplitPreview[],
): boolean {
  const stable = preview.every((item, index) => index === 0 ||
    preview[index - 1]!.tenant_supplier_id < item.tenant_supplier_id);
  const totals = preview.reduce((sum, item) => ({
    items: sum.items + item.item_count,
    subtotal: sum.subtotal + minor(item.subtotal_amount),
    tax: sum.tax + minor(item.tax_amount),
    total: sum.total + minor(item.total_amount),
  }), {
    items: 0,
    subtotal: BigInt(0),
    tax: BigInt(0),
    total: BigInt(0),
  });
  return stable && preview.length === batch.supplier_count &&
    totals.items === batch.item_count && totals.subtotal === minor(batch.subtotal_amount) &&
    totals.tax === minor(batch.tax_amount) && totals.total === minor(batch.total_amount);
}

function minor(value: string): bigint {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer) * BigInt(100) +
    BigInt(fraction.padEnd(2, "0"));
}

function issue(context: z.RefinementCtx, message: string) {
  context.addIssue({ code: "custom", message });
}

export type SupplierPurchaseBatchCommandEnvelope =
  z.infer<typeof SupplierPurchaseBatchCommandEnvelopeSchema>;
export type SupplierPurchaseBatchBlocker =
  z.infer<typeof SupplierPurchaseBatchBlockerSchema>;
export type SupplierPurchaseBatchOrderSummary =
  z.infer<typeof SupplierPurchaseBatchOrderSummarySchema>;
export type SupplierPurchaseBatchRevisionErrorCode =
  z.infer<typeof SupplierPurchaseBatchRevisionErrorCodeSchema>;
