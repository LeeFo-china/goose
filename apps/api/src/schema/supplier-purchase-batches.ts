import { SUPPLIER_PURCHASE_BATCH_STATUS_VALUES } from "@gooes/domain";
import { z } from "zod";

import { PaginationQuerySchema } from "./request";

const uuid = (message: string) => z.uuid(message);
const keyword = z.string().trim().max(80, "关键词不能超过 80 个字符");
const expectedVersion = z.number().int().positive("版本号必须是正整数");
const requiredText = (field: string) => z.string().trim()
  .min(1, `${field}不能为空`)
  .max(500, `${field}不能超过 500 个字符`);
const optionalRemark = requiredText("备注").nullable().optional();
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

export const SupplierPurchaseBatchStatusSchema = z.enum(
  SUPPLIER_PURCHASE_BATCH_STATUS_VALUES,
  { message: "无效的采购批次状态" },
);

export const SupplierPurchaseBatchListQuerySchema =
  PaginationQuerySchema.extend({
    keyword: keyword.optional(),
    status: SupplierPurchaseBatchStatusSchema.optional(),
    projectId: uuid("无效的项目 ID").optional(),
  }).strict();

export const SupplierPurchaseBatchParamSchema = z.object({
  id: uuid("无效的供应商采购批次 ID"),
}).strict();

const childListQuery = PaginationQuerySchema.strict();
export const SupplierPurchaseBatchItemListQuerySchema = childListQuery;
export const SupplierPurchaseBatchRequisitionListQuerySchema = childListQuery;
export const SupplierPurchaseBatchOrderListQuerySchema = childListQuery;

const optionQuery = PaginationQuerySchema.extend({
  keyword: keyword.optional(),
}).strict();
export const SupplierPurchaseBatchProjectOptionQuerySchema = optionQuery.extend({
  updatedWindow: z.enum(["last_7_days", "current_month"], {
    message: "无效的项目更新时间范围",
  }).optional(),
  timezone: z.enum(["Asia/Shanghai"], {
    message: "无效的项目更新时间时区",
  }).optional(),
}).strict();
export const SupplierPurchaseBatchCostCategoryQuerySchema = optionQuery;

export const SupplierPurchaseBatchCatalogQuerySchema =
  PaginationQuerySchema.extend({
    projectId: uuid("无效的项目 ID"),
    keyword: keyword.optional(),
    categoryId: uuid("无效的目录分类 ID").optional(),
    brandId: uuid("无效的目录品牌 ID").optional(),
    tenantSupplierId: uuid("无效的租户供应商关系 ID").optional(),
  }).strict();

export const SupplierPurchaseBatchDraftItemSchema = z.object({
  supplier_sku_id: uuid("无效的供应商 SKU ID"),
  cost_category_id: uuid("无效的成本分类 ID"),
  quantity,
}).strict();

export const SupplierPurchaseBatchDraftSchema = z.object({
  project_id: uuid("无效的项目 ID"),
  expected_version: z.number().int().nonnegative("版本号不能为负数"),
  reason: requiredText("采购原因"),
  expected_delivery_date: z.iso.date({
    message: "预计交付日期格式无效",
  }).nullable().optional(),
  remark: optionalRemark,
  items: z.array(SupplierPurchaseBatchDraftItemSchema)
    .min(1, "采购批次至少需要一个明细")
    .max(100, "采购批次明细不能超过 100 行"),
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

export const SupplierPurchaseBatchSubmitSchema = z.object({
  expected_version: expectedVersion,
}).strict();

export const SupplierPurchaseBatchReviewSchema = z.object({
  expected_version: expectedVersion,
  action: z.enum(["approve", "reject"], { message: "无效的审核动作" }),
  remark: optionalRemark,
}).strict().superRefine((input, context) => {
  if (input.action === "reject" && input.remark == null) {
    context.addIssue({
      code: "custom",
      path: ["remark"],
      message: "驳回时必须填写审核备注",
    });
  }
});

export const SupplierPurchaseBatchCancelSchema = z.object({
  expected_version: expectedVersion,
  reason: requiredText("取消原因"),
}).strict();

export const SupplierPurchaseBatchWithdrawSchema = z.object({
  expected_version: expectedVersion,
  reason: requiredText("撤回原因").optional(),
}).strict();

export type SupplierPurchaseBatchStatus =
  z.infer<typeof SupplierPurchaseBatchStatusSchema>;
export type SupplierPurchaseBatchListQuery =
  z.infer<typeof SupplierPurchaseBatchListQuerySchema>;
export type SupplierPurchaseBatchParam =
  z.infer<typeof SupplierPurchaseBatchParamSchema>;
export type SupplierPurchaseBatchItemListQuery =
  z.infer<typeof SupplierPurchaseBatchItemListQuerySchema>;
export type SupplierPurchaseBatchRequisitionListQuery =
  z.infer<typeof SupplierPurchaseBatchRequisitionListQuerySchema>;
export type SupplierPurchaseBatchOrderListQuery =
  z.infer<typeof SupplierPurchaseBatchOrderListQuerySchema>;
export type SupplierPurchaseBatchProjectOptionQuery =
  z.infer<typeof SupplierPurchaseBatchProjectOptionQuerySchema>;
export type SupplierPurchaseBatchCostCategoryQuery =
  z.infer<typeof SupplierPurchaseBatchCostCategoryQuerySchema>;
export type SupplierPurchaseBatchCatalogQuery =
  z.infer<typeof SupplierPurchaseBatchCatalogQuerySchema>;
export type SupplierPurchaseBatchDraftItem =
  z.infer<typeof SupplierPurchaseBatchDraftItemSchema>;
export type SupplierPurchaseBatchDraftInput =
  z.infer<typeof SupplierPurchaseBatchDraftSchema>;
export type SupplierPurchaseBatchSubmitInput =
  z.infer<typeof SupplierPurchaseBatchSubmitSchema>;
export type SupplierPurchaseBatchReviewInput =
  z.infer<typeof SupplierPurchaseBatchReviewSchema>;
export type SupplierPurchaseBatchCancelInput =
  z.infer<typeof SupplierPurchaseBatchCancelSchema>;
export type SupplierPurchaseBatchWithdrawInput =
  z.infer<typeof SupplierPurchaseBatchWithdrawSchema>;
