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

export const PROJECT_RECEIVABLE_SOURCE_TYPE_VALUES = [
  "workflow_node",
  "manual",
  "migration",
  "add_on",
] as const;

export const PROJECT_RECEIVABLE_EVENT_TYPE_VALUES = [
  "manual_created",
  "adjusted",
  "canceled",
  "follow_up",
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
  owner_employee_id: z.uuid("请选择有效的负责人").optional(),
  source_type: z.enum(PROJECT_RECEIVABLE_SOURCE_TYPE_VALUES, {
    message: "无效的应收来源",
  }).optional(),
  follow_up_due_only: OptionalBooleanQuerySchema,
});

export const FinanceReceivableListQuerySchema = ReceivableQueryBaseSchema.extend({
  project_id: z.uuid("请选择有效的项目").optional(),
});

export const ProjectReceivableListQuerySchema = ReceivableQueryBaseSchema;

const MoneyAmountSchema = z.coerce.number("金额必须是数字")
  .positive("金额必须大于 0");

const OptionalEmployeeIdSchema = z.preprocess((value) => {
  if (value === "" || value === null) return undefined;
  return value;
}, z.uuid("请选择有效的负责人").optional());

const OptionalTimestampSchema = z.preprocess((value) => {
  if (value === "" || value === null) return undefined;
  return value;
}, z.string().datetime("时间格式必须为 ISO 日期时间").optional());

export const CreateFinanceReceivableSchema = z.object({
  project_id: z.uuid("请选择有效的项目"),
  payment_type: z.enum(PROJECT_RECEIVABLE_PAYMENT_TYPE_VALUES, {
    message: "无效的收款类型",
  }),
  title: z.string().trim().min(1, "请输入应收事项").max(80, "应收事项不能超过 80 个字符"),
  amount: MoneyAmountSchema,
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "应收日期格式必须为 YYYY-MM-DD"),
  owner_employee_id: OptionalEmployeeIdSchema,
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").optional(),
});

export const UpdateFinanceReceivableSchema = z.object({
  payment_type: z.enum(PROJECT_RECEIVABLE_PAYMENT_TYPE_VALUES, {
    message: "无效的收款类型",
  }).optional(),
  title: z.string().trim().min(1, "请输入应收事项").max(80, "应收事项不能超过 80 个字符").optional(),
  amount: MoneyAmountSchema.optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "应收日期格式必须为 YYYY-MM-DD").optional(),
  owner_employee_id: OptionalEmployeeIdSchema,
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").optional(),
}).refine((value) =>
  value.payment_type !== undefined ||
  value.title !== undefined ||
  value.amount !== undefined ||
  value.due_date !== undefined ||
  value.owner_employee_id !== undefined, {
    message: "请至少提交一个调整字段",
  });

export const CancelFinanceReceivableSchema = z.object({
  reason: z.string().trim().min(1, "请输入取消原因").max(500, "取消原因不能超过 500 个字符"),
});

export const CreateFinanceReceivableFollowUpSchema = z.object({
  note: z.string().trim().min(1, "请输入跟进内容").max(500, "跟进内容不能超过 500 个字符"),
  next_follow_up_at: OptionalTimestampSchema,
});

export const FinanceReceivableEventListQuerySchema = PaginationQuerySchema;

export type ProjectReceivableStatus =
  (typeof PROJECT_RECEIVABLE_STATUS_VALUES)[number];
export type ProjectReceivablePaymentType =
  (typeof PROJECT_RECEIVABLE_PAYMENT_TYPE_VALUES)[number];
export type ProjectReceivableSourceType =
  (typeof PROJECT_RECEIVABLE_SOURCE_TYPE_VALUES)[number];
export type ProjectReceivableEventType =
  (typeof PROJECT_RECEIVABLE_EVENT_TYPE_VALUES)[number];
export type FinanceReceivableListQuery = z.infer<
  typeof FinanceReceivableListQuerySchema
>;
export type ProjectReceivableListQuery = z.infer<
  typeof ProjectReceivableListQuerySchema
>;
export type CreateFinanceReceivableInput = z.infer<
  typeof CreateFinanceReceivableSchema
>;
export type UpdateFinanceReceivableInput = z.infer<
  typeof UpdateFinanceReceivableSchema
>;
export type CancelFinanceReceivableInput = z.infer<
  typeof CancelFinanceReceivableSchema
>;
export type CreateFinanceReceivableFollowUpInput = z.infer<
  typeof CreateFinanceReceivableFollowUpSchema
>;
export type FinanceReceivableEventListQuery = z.infer<
  typeof FinanceReceivableEventListQuerySchema
>;
