import { z } from "zod";

import { PaginationQuerySchema } from "./request";

export const SUPPLIER_PURCHASE_ORDER_STATUS_VALUES = [
  "draft",
  "submitted",
  "cancelled",
] as const;

const uuid = (message: string) => z.uuid(message);
const expectedVersion = z.coerce.number().int()
  .positive("版本号必须是正整数");
const keyword = z.string().trim().max(80, "关键词不能超过 80 个字符");
const optionalRemark = z.string().trim()
  .min(1, "备注不能为空")
  .max(1000, "备注不能超过 1000 个字符")
  .nullable()
  .optional();
const requiredTrimmedText = (maximum: number, field: string) =>
  z.string().trim()
    .min(1, `${field}不能为空`)
    .max(maximum, `${field}不能超过 ${maximum} 个字符`);
const optionalTrimmedText = (maximum: number, field: string) =>
  z.string().trim()
    .max(maximum, `${field}不能超过 ${maximum} 个字符`)
    .nullable()
    .optional();
const hasScale = (value: number, scale: number) => {
  const text = value.toString();
  if (/[eE]/.test(text)) return false;
  return (text.split(".")[1]?.length ?? 0) <= scale;
};
const quantity = z.number().finite()
  .positive("采购数量必须大于 0")
  .max(99_999_999_999_999.9999, "采购数量超过数据库上限")
  .refine((value) => hasScale(value, 4), "采购数量最多保留 4 位小数");
const positiveFulfillmentQuantity = z.number().finite()
  .positive("履约数量必须大于 0")
  .lt(100_000_000_000_000, "采购数量超过数据库上限")
  .refine((value) => hasScale(value, 4), "履约数量最多保留 4 位小数");
const nonnegativeFulfillmentQuantity = z.number().finite()
  .nonnegative("履约数量不能小于 0")
  .lt(100_000_000_000_000, "采购数量超过数据库上限")
  .refine((value) => hasScale(value, 4), "履约数量最多保留 4 位小数");
const fulfillmentDateTime = z.iso.datetime({
  offset: true,
  message: "履约时间格式无效",
});
const financialSummaryMoney = z.string()
  .regex(/^(?:0|[1-9]\d{0,15})\.\d{2}$/, "金额格式无效");

export const SupplierPurchaseOrderStatusSchema = z.enum(
  SUPPLIER_PURCHASE_ORDER_STATUS_VALUES,
  { message: "无效的采购单状态" },
);

export const SupplierPurchaseOrderListQuerySchema =
  PaginationQuerySchema.extend({
    keyword: keyword.optional(),
    status: SupplierPurchaseOrderStatusSchema.optional(),
    projectId: uuid("无效的项目 ID").optional(),
    tenantSupplierId: uuid("无效的租户供应商关系 ID").optional(),
  }).strict();

export const SupplierPurchaseOrderCatalogQuerySchema =
  PaginationQuerySchema.extend({
    tenantSupplierId: uuid("无效的租户供应商关系 ID"),
    keyword: keyword.optional(),
  }).strict();

export const SupplierPurchaseOrderOptionQuerySchema =
  PaginationQuerySchema.extend({
    keyword: keyword.optional(),
  }).strict();

export const SupplierPurchaseOrderParamSchema = z.object({
  id: uuid("无效的供应商采购单 ID"),
}).strict();

export const SupplierPurchaseOrderFinancialSummarySchema = z.object({
  purchase_order_id: uuid("无效的供应商采购单 ID"),
  accepted_amount: financialSummaryMoney,
  payable_amount: financialSummaryMoney,
  reserved_request_amount: financialSummaryMoney,
  paid_amount: financialSummaryMoney,
  open_amount: financialSummaryMoney,
  available_to_request_amount: financialSummaryMoney,
}).strict();

export const SupplierPurchaseOrderItemListQuerySchema =
  PaginationQuerySchema.strict();

export const SupplierPurchaseOrderDraftItemSchema = z.object({
  supplier_sku_id: uuid("无效的供应商 SKU ID"),
  quantity,
}).strict();

export const SupplierPurchaseOrderDraftSchema = z.object({
  project_id: uuid("无效的项目 ID"),
  tenant_supplier_id: uuid("无效的租户供应商关系 ID"),
  expected_version: z.coerce.number().int()
    .nonnegative("版本号不能为负数"),
  expected_delivery_date: z.iso.date({
    message: "预计交付日期格式无效",
  }).nullable().optional(),
  remark: optionalRemark,
  items: z.array(SupplierPurchaseOrderDraftItemSchema)
    .min(1, "采购单至少需要一个明细")
    .max(100, "采购单明细不能超过 100 行"),
}).strict().superRefine((input, context) => {
  const seen = new Set<string>();
  input.items.forEach((item, index) => {
    if (seen.has(item.supplier_sku_id)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "supplier_sku_id"],
        message: "同一 SKU 不能重复添加",
      });
    }
    seen.add(item.supplier_sku_id);
  });
});

export const SupplierPurchaseOrderSubmitSchema = z.object({
  expected_version: expectedVersion,
}).strict();

export const SupplierPurchaseOrderCancelSchema = z.object({
  expected_version: expectedVersion,
  reason: z.string().trim()
    .min(2, "请填写取消原因")
    .max(500, "取消原因不能超过 500 个字符"),
}).strict();

const SupplierPurchaseOrderShipmentLineSchema = z.object({
  purchase_order_item_id: uuid("无效的供应商采购单明细 ID"),
  quantity: positiveFulfillmentQuantity,
}).strict();

const SupplierPurchaseOrderReceiptLineSchema = z.object({
  purchase_order_item_id: uuid("无效的供应商采购单明细 ID"),
  accepted_quantity: nonnegativeFulfillmentQuantity,
  rejected_quantity: nonnegativeFulfillmentQuantity,
  variance_reason: optionalTrimmedText(500, "差异原因"),
}).strict();

export const SupplierPurchaseOrderFulfillmentConfirmSchema = z.object({
  expected_version: z.number().int().positive("版本号必须是正整数"),
  confirmed_at: fulfillmentDateTime,
  remark: optionalTrimmedText(500, "确认备注"),
}).strict();

export const SupplierPurchaseOrderFulfillmentEventListQuerySchema =
  PaginationQuerySchema.strict();

export const SupplierPurchaseOrderShipmentCreateSchema = z.object({
  id: uuid("无效的发货 ID"),
  expected_fulfillment_version: z.number().int()
    .positive("履约版本号必须是正整数"),
  shipment_no: requiredTrimmedText(80, "发货编号"),
  carrier_name: optionalTrimmedText(100, "承运方"),
  tracking_no: optionalTrimmedText(120, "运单号"),
  shipped_at: fulfillmentDateTime,
  remark: optionalTrimmedText(500, "发货备注"),
  items: z.array(SupplierPurchaseOrderShipmentLineSchema)
    .min(1, "发货至少需要一个明细")
    .max(100, "发货明细不能超过 100 行"),
}).strict().superRefine((input, context) => {
  uniquePurchaseOrderItemIds(input.items, context);
});

export const SupplierPurchaseOrderReceiptCreateSchema = z.object({
  id: uuid("无效的收货 ID"),
  expected_fulfillment_version: z.number().int()
    .positive("履约版本号必须是正整数"),
  receipt_no: requiredTrimmedText(80, "收货编号"),
  received_at: fulfillmentDateTime,
  remark: optionalTrimmedText(500, "收货备注"),
  items: z.array(SupplierPurchaseOrderReceiptLineSchema)
    .min(1, "收货至少需要一个明细")
    .max(100, "收货明细不能超过 100 行"),
}).strict().superRefine((input, context) => {
  uniquePurchaseOrderItemIds(input.items, context);
  input.items.forEach((item, index) => {
    if (item.accepted_quantity + item.rejected_quantity <= 0) {
      context.addIssue({
        code: "custom",
        path: ["items", index],
        message: "本次收货数量必须大于 0",
      });
    }
    if (item.rejected_quantity > 0 && !item.variance_reason) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "variance_reason"],
        message: "存在拒收数量时必须填写差异原因",
      });
    }
    if (item.rejected_quantity === 0 && item.variance_reason != null) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "variance_reason"],
        message: "无拒收数量时差异原因必须为空",
      });
    }
  });
});

function uniquePurchaseOrderItemIds(
  items: readonly { purchase_order_item_id: string }[],
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const normalizedId = item.purchase_order_item_id.toLowerCase();
    if (seen.has(normalizedId)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "purchase_order_item_id"],
        message: "同一采购单明细不能重复添加",
      });
    }
    seen.add(normalizedId);
  });
}

export type SupplierPurchaseOrderListQuery =
  z.infer<typeof SupplierPurchaseOrderListQuerySchema>;
export type SupplierPurchaseOrderCatalogQuery =
  z.infer<typeof SupplierPurchaseOrderCatalogQuerySchema>;
export type SupplierPurchaseOrderOptionQuery =
  z.infer<typeof SupplierPurchaseOrderOptionQuerySchema>;
export type SupplierPurchaseOrderItemListQuery =
  z.infer<typeof SupplierPurchaseOrderItemListQuerySchema>;
export type SupplierPurchaseOrderDraftInput =
  z.infer<typeof SupplierPurchaseOrderDraftSchema>;
export type SupplierPurchaseOrderSubmitInput =
  z.infer<typeof SupplierPurchaseOrderSubmitSchema>;
export type SupplierPurchaseOrderCancelInput =
  z.infer<typeof SupplierPurchaseOrderCancelSchema>;
export type SupplierPurchaseOrderFulfillmentConfirmInput =
  z.infer<typeof SupplierPurchaseOrderFulfillmentConfirmSchema>;
export type SupplierPurchaseOrderFulfillmentEventListQuery =
  z.infer<typeof SupplierPurchaseOrderFulfillmentEventListQuerySchema>;
export type SupplierPurchaseOrderShipmentCreateInput =
  z.infer<typeof SupplierPurchaseOrderShipmentCreateSchema>;
export type SupplierPurchaseOrderReceiptCreateInput =
  z.infer<typeof SupplierPurchaseOrderReceiptCreateSchema>;
export type SupplierPurchaseOrderFinancialSummary =
  z.infer<typeof SupplierPurchaseOrderFinancialSummarySchema>;
