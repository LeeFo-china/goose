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
const hasScale = (value: number, scale: number) => {
  const text = value.toString();
  if (/[eE]/.test(text)) return false;
  return (text.split(".")[1]?.length ?? 0) <= scale;
};
const quantity = z.number().finite()
  .positive("采购数量必须大于 0")
  .max(99_999_999_999_999.9999, "采购数量超过数据库上限")
  .refine((value) => hasScale(value, 4), "采购数量最多保留 4 位小数");

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
