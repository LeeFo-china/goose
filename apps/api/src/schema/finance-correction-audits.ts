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

export const FinanceCorrectionAuditOperationSchema = z.enum([
  "manual_allocation",
  "adjust_allocation",
  "reverse_allocation",
  "generate_payment_ledger",
  "generate_expense_ledger",
  "link_ledger_payment",
  "mark_legacy_ledger",
  "update_expense_ledger_category",
  "record_expense_amount_mismatch_review",
]);

export type FinanceCorrectionAuditOperation =
  z.infer<typeof FinanceCorrectionAuditOperationSchema>;

export const FinanceCorrectionAuditListQuerySchema = PaginationQuerySchema
  .extend({
    operation: optionalQueryValue(FinanceCorrectionAuditOperationSchema),
    project_id: optionalQueryValue(z.uuid("请选择有效的项目")),
    actor_employee_id: optionalQueryValue(z.uuid("请选择有效的操作人")),
    date_from: optionalQueryValue(
      z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "开始日期格式必须为 YYYY-MM-DD"),
    ),
    date_to: optionalQueryValue(
      z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "结束日期格式必须为 YYYY-MM-DD"),
    ),
  });

export type FinanceCorrectionAuditListQuery =
  z.infer<typeof FinanceCorrectionAuditListQuerySchema>;

export type FinanceCorrectionAuditDomain = "receivable" | "ledger";

export type FinanceCorrectionAuditRecord = {
  id: string;
  operation: FinanceCorrectionAuditOperation;
  operation_label: string;
  domain: FinanceCorrectionAuditDomain;
  project_id: string | null;
  project_name: string | null;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  occurred_at: string;
  reason: string | null;
  amount: number | null;
  receivable_plan_id: string | null;
  allocation_id: string | null;
  payment_id: string | null;
  ledger_id: string | null;
  target: {
    label: string;
    href: string;
  };
};

export type FinanceCorrectionAuditSummary = {
  total: number;
  ledger_repair: number;
  receivable_allocation: number;
};
