import { z } from "zod";

import { PaginationQuerySchema } from "./request";

export const SUPPLIER_PURCHASE_REQUISITION_STATUS_VALUES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
  "converted",
] as const;

export const SUPPLIER_PURCHASE_REQUISITION_BUDGET_STATUS_VALUES = [
  "unchecked",
  "within_budget",
  "over_budget",
] as const;

const uuid = (message: string) => z.uuid(message);
const expectedVersion = z.number().int()
  .positive("版本号必须是正整数");
const optionalRemark = z.string().trim()
  .max(500, "备注不能超过 500 个字符")
  .nullable()
  .optional();
const requiredReason = z.string().trim()
  .min(1, "原因不能为空")
  .max(500, "原因不能超过 500 个字符");
const keyword = z.string().trim().max(80, "关键词不能超过 80 个字符");

const quantity = z.string()
  .regex(/^\d+(?:\.\d{1,4})?$/, "采购数量最多保留 4 位小数")
  .transform((value) => {
    const [integerPart = "0", fractionPart] = value.split(".");
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "");
    return fractionPart === undefined
      ? normalizedInteger
      : `${normalizedInteger}.${fractionPart}`;
  })
  .refine((value) => /[1-9]/.test(value), "采购数量必须大于 0")
  .refine(
    (value) => (value.split(".")[0]?.length ?? 0) <= 14,
    "采购数量超过数据库上限",
  );

export const SupplierPurchaseRequisitionStatusSchema = z.enum(
  SUPPLIER_PURCHASE_REQUISITION_STATUS_VALUES,
  { message: "无效的采购申请状态" },
);

export const SupplierPurchaseRequisitionBudgetStatusSchema = z.enum(
  SUPPLIER_PURCHASE_REQUISITION_BUDGET_STATUS_VALUES,
  { message: "无效的预算状态" },
);

export const SupplierPurchaseRequisitionListQuerySchema =
  PaginationQuerySchema.extend({
    keyword: keyword.optional(),
    status: SupplierPurchaseRequisitionStatusSchema.optional(),
    budget_status: SupplierPurchaseRequisitionBudgetStatusSchema.optional(),
    project_id: uuid("无效的项目 ID").optional(),
    tenant_supplier_id: uuid("无效的租户供应商关系 ID").optional(),
  }).strict();

export const SupplierPurchaseRequisitionParamSchema = z.object({
  id: uuid("无效的供应商采购申请 ID"),
}).strict();

export const SupplierPurchaseRequisitionItemListQuerySchema =
  PaginationQuerySchema.strict();

export const SupplierPurchaseRequisitionDraftItemSchema = z.object({
  supplier_sku_id: uuid("无效的供应商 SKU ID"),
  cost_category_id: uuid("无效的成本分类 ID"),
  quantity,
}).strict();

export const SupplierPurchaseRequisitionDraftSchema = z.object({
  project_id: uuid("无效的项目 ID"),
  tenant_supplier_id: uuid("无效的租户供应商关系 ID"),
  expected_version: z.number().int()
    .nonnegative("版本号不能为负数"),
  reason: requiredReason,
  expected_delivery_date: z.iso.date({
    message: "预计交付日期格式无效",
  }).nullable().optional(),
  remark: optionalRemark,
  items: z.array(SupplierPurchaseRequisitionDraftItemSchema)
    .min(1, "采购申请至少需要一个明细")
    .max(100, "采购申请明细不能超过 100 行"),
}).strict().superRefine((input, context) => {
  const seen = new Set<string>();
  input.items.forEach((item, index) => {
    const normalizedId = item.supplier_sku_id.toLowerCase();
    if (seen.has(normalizedId)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "supplier_sku_id"],
        message: "同一 SKU 不能重复添加",
      });
    }
    seen.add(normalizedId);
  });
});

export const SupplierPurchaseRequisitionSubmitSchema = z.object({
  expected_version: expectedVersion,
}).strict();

export const SupplierPurchaseRequisitionReviewSchema = z.object({
  expected_version: expectedVersion,
  action: z.enum(["approve", "reject"], { message: "无效的审核动作" }),
  remark: optionalRemark,
}).strict();

export const SupplierPurchaseRequisitionCancelSchema = z.object({
  expected_version: expectedVersion,
  reason: requiredReason,
}).strict();

export const SupplierPurchaseRequisitionConvertSchema = z.object({
  expected_version: expectedVersion,
  purchase_order_id: uuid("无效的供应商采购单 ID"),
}).strict();

export type SupplierPurchaseRequisitionStatus =
  z.infer<typeof SupplierPurchaseRequisitionStatusSchema>;
export type SupplierPurchaseRequisitionBudgetStatus =
  z.infer<typeof SupplierPurchaseRequisitionBudgetStatusSchema>;
export type SupplierPurchaseRequisitionListQuery =
  z.infer<typeof SupplierPurchaseRequisitionListQuerySchema>;
export type SupplierPurchaseRequisitionParam =
  z.infer<typeof SupplierPurchaseRequisitionParamSchema>;
export type SupplierPurchaseRequisitionItemListQuery =
  z.infer<typeof SupplierPurchaseRequisitionItemListQuerySchema>;
export type SupplierPurchaseRequisitionDraftItem =
  z.infer<typeof SupplierPurchaseRequisitionDraftItemSchema>;
export type SupplierPurchaseRequisitionDraftInput =
  z.infer<typeof SupplierPurchaseRequisitionDraftSchema>;
export type SupplierPurchaseRequisitionSubmitInput =
  z.infer<typeof SupplierPurchaseRequisitionSubmitSchema>;
export type SupplierPurchaseRequisitionReviewInput =
  z.infer<typeof SupplierPurchaseRequisitionReviewSchema>;
export type SupplierPurchaseRequisitionCancelInput =
  z.infer<typeof SupplierPurchaseRequisitionCancelSchema>;
export type SupplierPurchaseRequisitionConvertInput =
  z.infer<typeof SupplierPurchaseRequisitionConvertSchema>;
