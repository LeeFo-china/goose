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

export const FinanceLedgerListQuerySchema = PaginationQuerySchema.extend({
  project_id: z.uuid("请选择有效的项目").optional(),
  cost_category_id: optionalQueryValue(z.uuid("请选择有效的成本分类")),
  direction: z.enum(["in", "out"], { message: "无效的流水方向" }).optional(),
  entry_type: z.enum(
    ["project_payment", "expense_settlement", "refund", "adjustment"],
    { message: "无效的流水类型" },
  ).optional(),
  date_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "开始日期格式必须为 YYYY-MM-DD")
    .optional(),
  date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "结束日期格式必须为 YYYY-MM-DD")
    .optional(),
});

export type FinanceLedgerListQuery = z.infer<typeof FinanceLedgerListQuerySchema>;

export const FinanceProjectSummaryListQuerySchema = PaginationQuerySchema.extend({
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
  status: optionalQueryValue(z.string().trim().max(50, "项目状态过长")),
});

export type FinanceProjectSummaryListQuery =
  z.infer<typeof FinanceProjectSummaryListQuerySchema>;
