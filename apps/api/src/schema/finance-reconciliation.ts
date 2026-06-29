import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const FINANCE_RECONCILIATION_EXCEPTION_CODE_VALUES = [
  "receivable_overdue",
  "payment_without_ledger",
  "ledger_without_payment",
  "payment_unallocated",
  "allocation_amount_mismatch",
  "receivable_paid_amount_mismatch",
] as const;

export const FINANCE_RECONCILIATION_LEVEL_VALUES = [
  "info",
  "warning",
  "danger",
] as const;

export const FINANCE_RECONCILIATION_DIRECTION_VALUES = [
  "receivable",
  "payment",
  "expense",
  "ledger",
] as const;

export const FinanceReconciliationExceptionCodeSchema = z.enum(
  FINANCE_RECONCILIATION_EXCEPTION_CODE_VALUES,
  { message: "无效的对账异常类型" },
);

export const FinanceReconciliationLevelSchema = z.enum(
  FINANCE_RECONCILIATION_LEVEL_VALUES,
  { message: "无效的对账异常等级" },
);

export const FinanceReconciliationDirectionSchema = z.enum(
  FINANCE_RECONCILIATION_DIRECTION_VALUES,
  { message: "无效的对账方向" },
);

const OptionalDateSchema = z.preprocess((value) => {
  if (value == null || value === "") return undefined;
  return value;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD").optional());

export const FinanceReconciliationExceptionListQuerySchema =
  PaginationQuerySchema.extend({
    date_from: OptionalDateSchema,
    date_to: OptionalDateSchema,
    project_id: z.uuid("请选择有效的项目").optional(),
    exception_code: FinanceReconciliationExceptionCodeSchema.optional(),
    level: FinanceReconciliationLevelSchema.optional(),
    direction: FinanceReconciliationDirectionSchema.optional(),
    status: z.enum(["open", "resolved"], {
      message: "无效的对账异常状态",
    }).optional(),
  });

export type FinanceReconciliationExceptionCode =
  (typeof FINANCE_RECONCILIATION_EXCEPTION_CODE_VALUES)[number];
export type FinanceReconciliationLevel =
  (typeof FINANCE_RECONCILIATION_LEVEL_VALUES)[number];
export type FinanceReconciliationDirection =
  (typeof FINANCE_RECONCILIATION_DIRECTION_VALUES)[number];
export type FinanceReconciliationExceptionListQuery = z.infer<
  typeof FinanceReconciliationExceptionListQuerySchema
>;
