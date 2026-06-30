import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const FINANCE_RECONCILIATION_EXCEPTION_CODE_VALUES = [
  "receivable_overdue",
  "payment_without_ledger",
  "ledger_without_payment",
  "payment_unallocated",
  "allocation_amount_mismatch",
  "receivable_paid_amount_mismatch",
  "expense_paid_without_ledger",
  "expense_paid_amount_mismatch",
  "expense_ledger_without_category",
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

export const FINANCE_RECONCILIATION_STATUS_VALUES = [
  "open",
  "acknowledged",
  "ignored",
  "resolved",
] as const;

export const FINANCE_RECONCILIATION_ACTION_VALUES = [
  "acknowledge",
  "ignore",
  "resolve",
  "reopen",
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

export const FinanceReconciliationStatusSchema = z.enum(
  FINANCE_RECONCILIATION_STATUS_VALUES,
  { message: "无效的对账异常状态" },
);

export const FinanceReconciliationActionSchema = z.enum(
  FINANCE_RECONCILIATION_ACTION_VALUES,
  { message: "无效的对账异常处理动作" },
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
    status: FinanceReconciliationStatusSchema.optional(),
    actor_employee_id: z.uuid("请选择有效的处理人").optional(),
  });

export const FinanceReconciliationOperatingStatsQuerySchema = z.object({
  date_from: OptionalDateSchema,
  date_to: OptionalDateSchema,
  project_id: z.uuid("请选择有效的项目").optional(),
  exception_code: FinanceReconciliationExceptionCodeSchema.optional(),
  level: FinanceReconciliationLevelSchema.optional(),
  direction: FinanceReconciliationDirectionSchema.optional(),
  status: FinanceReconciliationStatusSchema.optional(),
  actor_employee_id: z.uuid("请选择有效的处理人").optional(),
});

export const CreateFinanceReconciliationExceptionActionSchema = z.object({
  action: FinanceReconciliationActionSchema,
  remark: z.string()
    .trim()
    .min(1, "请填写处理备注")
    .max(500, "处理备注不能超过 500 个字符"),
});

export const FinanceReconciliationExceptionFingerprintParamsSchema = z.object({
  fingerprint: z.string()
    .trim()
    .min(1, "缺少对账异常标识")
    .max(200, "对账异常标识过长"),
});

export const FinanceReconciliationExceptionActionListQuerySchema =
  PaginationQuerySchema;

export type FinanceReconciliationExceptionCode =
  (typeof FINANCE_RECONCILIATION_EXCEPTION_CODE_VALUES)[number];
export type FinanceReconciliationLevel =
  (typeof FINANCE_RECONCILIATION_LEVEL_VALUES)[number];
export type FinanceReconciliationDirection =
  (typeof FINANCE_RECONCILIATION_DIRECTION_VALUES)[number];
export type FinanceReconciliationStatus =
  (typeof FINANCE_RECONCILIATION_STATUS_VALUES)[number];
export type FinanceReconciliationAction =
  (typeof FINANCE_RECONCILIATION_ACTION_VALUES)[number];
export type FinanceReconciliationExceptionListQuery = z.infer<
  typeof FinanceReconciliationExceptionListQuerySchema
>;
export type FinanceReconciliationOperatingStatsQuery = z.infer<
  typeof FinanceReconciliationOperatingStatsQuerySchema
>;
export type FinanceReconciliationExceptionActionListQuery = z.infer<
  typeof FinanceReconciliationExceptionActionListQuerySchema
>;
export type CreateFinanceReconciliationExceptionAction = z.infer<
  typeof CreateFinanceReconciliationExceptionActionSchema
>;
