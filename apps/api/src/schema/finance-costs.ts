import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim();
      return normalized || undefined;
    }
    return value;
  }, schema.optional());
}

export const FinanceCostCategoryStatusSchema = z.enum(
  ["active", "inactive"],
  { message: "无效的成本分类状态" },
);

export const FinanceCostCategoryListQuerySchema =
  PaginationQuerySchema.extend({
    status: optionalQueryValue(FinanceCostCategoryStatusSchema),
  });

export type FinanceCostCategoryListQuery =
  z.infer<typeof FinanceCostCategoryListQuerySchema>;

export type FinanceCostCategoryStatus =
  z.infer<typeof FinanceCostCategoryStatusSchema>;

export const CreateFinanceCostCategorySchema = z.object({
  code: z.string()
    .trim()
    .min(1, "成本分类编码不能为空")
    .max(64, "成本分类编码不能超过 64 个字符")
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "成本分类编码只能包含小写字母、数字、下划线和中划线"),
  name: z.string()
    .trim()
    .min(1, "成本分类名称不能为空")
    .max(50, "成本分类名称不能超过 50 个字符"),
  sort_order: z.coerce.number()
    .int("排序必须是整数")
    .min(0, "排序不能小于 0")
    .max(9999, "排序不能超过 9999")
    .optional(),
});

export type CreateFinanceCostCategoryInput =
  z.infer<typeof CreateFinanceCostCategorySchema>;

export const UpdateFinanceCostCategorySchema = z.object({
  name: z.string()
    .trim()
    .min(1, "成本分类名称不能为空")
    .max(50, "成本分类名称不能超过 50 个字符")
    .optional(),
  status: FinanceCostCategoryStatusSchema.optional(),
  sort_order: z.coerce.number()
    .int("排序必须是整数")
    .min(0, "排序不能小于 0")
    .max(9999, "排序不能超过 9999")
    .optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "至少提供一个更新字段",
});

export type UpdateFinanceCostCategoryInput =
  z.infer<typeof UpdateFinanceCostCategorySchema>;

export const SaveProjectCostBudgetsSchema = z.object({
  items: z.array(z.object({
    cost_category_id: z.uuid("请选择有效的成本分类"),
    budget_amount: z.coerce.number()
      .min(0, "预算金额不能小于 0")
      .max(99_999_999.99, "预算金额过大"),
    warning_threshold_percent: z.coerce.number()
      .min(0.01, "预警阈值必须大于 0")
      .max(10_000, "预警阈值过大")
      .optional()
      .default(100),
    remark: z.preprocess((value) => {
      if (value == null) return null;
      if (typeof value === "string") {
        const normalized = value.trim();
        return normalized || null;
      }
      return value;
    }, z.string().max(200, "备注不能超过 200 个字符").nullable().optional()),
  })).max(100, "一次最多保存 100 个预算项"),
});

export type SaveProjectCostBudgetsInput =
  z.infer<typeof SaveProjectCostBudgetsSchema>;

export const UpdateFinanceLedgerCostCategorySchema = z.object({
  cost_category_id: z.uuid("请选择有效的成本分类").nullable(),
});

export type UpdateFinanceLedgerCostCategoryInput =
  z.infer<typeof UpdateFinanceLedgerCostCategorySchema>;
