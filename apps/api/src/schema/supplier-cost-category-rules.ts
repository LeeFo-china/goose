import { z } from "zod";

import { PaginationQuerySchema } from "./request";

const optionalKeyword = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim() || undefined;
}, z.string().max(80, "搜索内容不能超过 80 个字符").optional());

export const SupplierCostCategoryRuleScopeSchema = z.enum([
  "category",
  "product",
]);

export const SupplierCostCategoryOptionQuerySchema =
  PaginationQuerySchema.extend({ keyword: optionalKeyword }).strict();

export const SupplierCostCategoryRuleListQuerySchema =
  PaginationQuerySchema.extend({
    scope: SupplierCostCategoryRuleScopeSchema.optional(),
    targetId: z.uuid("无效的归类目标 ID").optional(),
  }).strict();

export const SupplierCostCategoryRuleTargetParamSchema = z.object({
  id: z.uuid("无效的归类目标 ID"),
}).strict();

export const SupplierCostCategoryRuleUpsertSchema = z.object({
  cost_category_id: z.uuid("无效的成本分类 ID"),
  expected_version: z.number().int().nonnegative("版本号不能为负数"),
}).strict();

export const SupplierCostCategoryRuleDeleteSchema = z.object({
  expected_version: z.number().int().positive("版本号必须是正整数"),
}).strict();

export type SupplierCostCategoryRuleScope = z.infer<
  typeof SupplierCostCategoryRuleScopeSchema
>;
export type SupplierCostCategoryOptionQuery = z.infer<
  typeof SupplierCostCategoryOptionQuerySchema
>;
export type SupplierCostCategoryRuleListQuery = z.infer<
  typeof SupplierCostCategoryRuleListQuerySchema
>;
export type SupplierCostCategoryRuleUpsertInput = z.infer<
  typeof SupplierCostCategoryRuleUpsertSchema
>;
