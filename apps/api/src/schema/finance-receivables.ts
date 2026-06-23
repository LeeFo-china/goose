import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const PROJECT_RECEIVABLE_STATUS_VALUES = [
  "pending",
  "partially_paid",
  "paid",
  "overdue",
  "canceled",
] as const;

export const PROJECT_RECEIVABLE_PAYMENT_TYPE_VALUES = [
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
] as const;

const OptionalBooleanQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}, z.boolean({ message: "布尔参数必须是 true 或 false" }).optional());

const ReceivableQueryBaseSchema = PaginationQuerySchema.extend({
  status: z.enum(PROJECT_RECEIVABLE_STATUS_VALUES, {
    message: "无效的应收状态",
  }).optional(),
  payment_type: z.enum(PROJECT_RECEIVABLE_PAYMENT_TYPE_VALUES, {
    message: "无效的收款类型",
  }).optional(),
  due_date_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "开始日期格式必须为 YYYY-MM-DD")
    .optional(),
  due_date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "结束日期格式必须为 YYYY-MM-DD")
    .optional(),
  overdue_only: OptionalBooleanQuerySchema,
});

export const FinanceReceivableListQuerySchema = ReceivableQueryBaseSchema.extend({
  project_id: z.uuid("请选择有效的项目").optional(),
});

export const ProjectReceivableListQuerySchema = ReceivableQueryBaseSchema;

export type ProjectReceivableStatus =
  (typeof PROJECT_RECEIVABLE_STATUS_VALUES)[number];
export type ProjectReceivablePaymentType =
  (typeof PROJECT_RECEIVABLE_PAYMENT_TYPE_VALUES)[number];
export type FinanceReceivableListQuery = z.infer<
  typeof FinanceReceivableListQuerySchema
>;
export type ProjectReceivableListQuery = z.infer<
  typeof ProjectReceivableListQuerySchema
>;
