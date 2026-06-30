import { z } from "zod";

const OptionalDateSchema = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  return value;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD").optional());

const OptionalMonthSchema = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  return value;
}, z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月份格式必须为 YYYY-MM")
  .optional());

const PageSchema = z.coerce.number()
  .int("页码必须是整数")
  .min(1, "页码不能小于 1")
  .default(1);

const PageSizeSchema = z.coerce.number()
  .int("每页数量必须是整数")
  .min(1, "每页数量不能小于 1")
  .max(100, "每页数量不能超过 100")
  .default(20);

const ReportSortOrderSchema = z.enum(["asc", "desc"]).default("desc");

export const FinanceOperatingReportGroupBySchema = z.enum(
  ["day", "month", "project", "payment_type", "cost_category"],
  { message: "无效的报表分组方式" },
);

export const FinanceOperatingReportQuerySchema = z.object({
  date_from: OptionalDateSchema,
  date_to: OptionalDateSchema,
  group_by: FinanceOperatingReportGroupBySchema.optional(),
  project_id: z.uuid("请选择有效的项目").optional(),
  project_status: z.string().trim().max(50, "项目状态过长").optional(),
});

export const FinanceMonthlyOverviewQuerySchema = z.object({
  month: OptionalMonthSchema,
});

export const FinanceProjectRankingSortBySchema = z.enum([
  "income_amount",
  "expense_amount",
  "gross_profit_amount",
  "gross_profit_rate",
  "receivable_remaining_amount",
  "overdue_receivable_amount",
  "reconciliation_exception_count",
]);

export const FinanceProjectRankingQuerySchema = z.object({
  month: OptionalMonthSchema,
  date_from: OptionalDateSchema,
  date_to: OptionalDateSchema,
  project_status: z.string().trim().max(50, "项目状态过长").optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
  sort_by: FinanceProjectRankingSortBySchema.default("gross_profit_amount"),
  sort_order: ReportSortOrderSchema,
});

export const FinanceCostCategorySummarySortBySchema = z.enum([
  "expense_amount",
  "ledger_entry_count",
  "project_count",
]);

export const FinanceCostCategorySummaryQuerySchema = z.object({
  month: OptionalMonthSchema,
  date_from: OptionalDateSchema,
  date_to: OptionalDateSchema,
  page: PageSchema,
  pageSize: PageSizeSchema,
  sort_by: FinanceCostCategorySummarySortBySchema.default("expense_amount"),
  sort_order: ReportSortOrderSchema,
});

export const FinanceReceivableAgingQuerySchema = z.object({
  as_of: OptionalDateSchema,
  project_status: z.string().trim().max(50, "项目状态过长").optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const FinanceMonthlyOverviewExportQuerySchema = z.object({
  month: OptionalMonthSchema,
  format: z.enum(["csv"]).default("csv"),
});

export type FinanceOperatingReportGroupBy = z.infer<
  typeof FinanceOperatingReportGroupBySchema
>;
export type FinanceOperatingReportQuery = z.infer<
  typeof FinanceOperatingReportQuerySchema
>;
export type FinanceMonthlyOverviewQuery = z.infer<
  typeof FinanceMonthlyOverviewQuerySchema
>;
export type FinanceProjectRankingQuery = z.infer<
  typeof FinanceProjectRankingQuerySchema
>;
export type FinanceCostCategorySummaryQuery = z.infer<
  typeof FinanceCostCategorySummaryQuerySchema
>;
export type FinanceReceivableAgingQuery = z.infer<
  typeof FinanceReceivableAgingQuerySchema
>;
export type FinanceMonthlyOverviewExportQuery = z.infer<
  typeof FinanceMonthlyOverviewExportQuerySchema
>;
