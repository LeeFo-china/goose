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

export type FinanceOperatingReportGroupBy = z.infer<
  typeof FinanceOperatingReportGroupBySchema
>;
export type FinanceOperatingReportQuery = z.infer<
  typeof FinanceOperatingReportQuerySchema
>;
export type FinanceMonthlyOverviewQuery = z.infer<
  typeof FinanceMonthlyOverviewQuerySchema
>;
