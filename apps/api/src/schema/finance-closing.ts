import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

const MonthSchema = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月份格式必须为 YYYY-MM");

const OptionalMonthSchema = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  return value;
}, MonthSchema.optional());

const OptionalNotesSchema = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  return value;
}, z.string().trim().max(500, "备注不能超过 500 个字符").optional());

export const FinanceClosingPeriodListQuerySchema = PaginationQuerySchema.extend({
  month: OptionalMonthSchema,
});

export const CreateFinanceClosingDraftSchema = z.object({
  month: MonthSchema,
  notes: OptionalNotesSchema,
});

export const CloseFinanceClosingPeriodSchema = z.object({
  notes: OptionalNotesSchema,
});

export const ReopenFinanceClosingPeriodSchema = z.object({
  reason: z.string()
    .trim()
    .min(1, "请填写反结账原因")
    .max(500, "反结账原因不能超过 500 个字符"),
});

export type FinanceClosingPeriodListQuery = z.infer<
  typeof FinanceClosingPeriodListQuerySchema
>;
export type CreateFinanceClosingDraft = z.infer<
  typeof CreateFinanceClosingDraftSchema
>;
export type CloseFinanceClosingPeriod = z.infer<
  typeof CloseFinanceClosingPeriodSchema
>;
export type ReopenFinanceClosingPeriod = z.infer<
  typeof ReopenFinanceClosingPeriodSchema
>;
