import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";
import {
  EXPENSE_APPROVAL_ACTION_VALUES,
  EXPENSE_MODE_VALUES,
  EXPENSE_REQUEST_STEP_VALUES,
  EXPENSE_SETTLEMENT_METHOD_VALUES,
  EXPENSE_STATUS_VALUES,
} from "@gooes/domain";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

export const ExpenseStatusSchema = z.enum(EXPENSE_STATUS_VALUES, {
  message: "无效的费用申请状态",
});

export const ExpenseModeSchema = z.enum(EXPENSE_MODE_VALUES, {
  message: "无效的费用申请模式",
});

export const ExpenseRequestStepSchema = z.enum(EXPENSE_REQUEST_STEP_VALUES, {
  message: "无效的费用审批节点",
});

export const ExpenseApprovalActionSchema = z.enum(
  EXPENSE_APPROVAL_ACTION_VALUES,
  {
    message: "无效的费用审批动作",
  },
);

export const ExpenseSettlementMethodSchema = z.enum(
  EXPENSE_SETTLEMENT_METHOD_VALUES,
  {
    message: "无效的结算方式",
  },
);

export const ExpenseApprovalChainStepSchema = z.enum(
  ["manager_review", "finance_review"],
  {
    message: "无效的审批链节点",
  },
);

export const ExpenseApprovalCandidateStepSchema = z.enum(
  ["manager_review", "finance_review", "payment"],
  {
    message: "无效的审批候选节点",
  },
);

export const ExpenseApprovalChainItemSchema = z.object({
  step: ExpenseApprovalChainStepSchema,
  assignee_id: z.uuid("无效的审批人 ID"),
});

export const ExpenseRequestItemSchema = z.object({
  id: z.uuid("无效的费用明细 ID").optional(),
  occurred_at: z.string().datetime("无效的费用发生时间").nullable().optional(),
  category_code: z.string().trim().min(1, "费用分类编码不能为空").max(
    50,
    "费用分类编码过长",
  ).regex(/^[a-z0-9_]+$/, "费用分类编码格式不正确").nullable().optional(),
  category: z.string().trim().min(1, "费用分类不能为空").max(100, "费用分类过长")
    .nullable()
    .optional(),
  category_remark: z.string().trim().max(500, "分类补充说明过长").nullable()
    .optional(),
  amount: z.coerce.number("费用金额必须是数字").min(0, "费用金额不能为负数"),
  remark: z.string().trim().max(500, "费用说明过长").nullable().optional(),
  invoice_no: z.string().trim().max(100, "发票号过长").nullable().optional(),
  vendor_name: z.string().trim().max(200, "商户名称过长").nullable().optional(),
  evidence_images: z.array(z.string().trim().min(1, "凭证图片不能为空"))
    .default([]),
}).superRefine((input, ctx) => {
  const categoryCode = input.category_code?.trim();
  const category = input.category?.trim();

  if (!categoryCode && !category) {
    ctx.addIssue({
      code: "custom",
      path: ["category_code"],
      message: "费用分类不能为空",
    });
  }
});

export const CreateExpenseRequestSchema = z.object({
  employee_id: z.uuid("无效的员工 ID"),
  project_id: z.uuid("无效的项目 ID").nullable().optional(),
  mode: ExpenseModeSchema,
  title: z.string().trim().max(200, "申请标题过长").nullable().optional(),
  items: z.array(ExpenseRequestItemSchema).max(100, "费用明细不能超过 100 条")
    .default([]),
  approval_chain: z.array(ExpenseApprovalChainItemSchema).optional(),
});

export const UpdateExpenseRequestSchema = z.object({
  project_id: z.uuid("无效的项目 ID").nullable().optional(),
  mode: ExpenseModeSchema.optional(),
  title: z.string().trim().max(200, "申请标题过长").nullable().optional(),
  items: z.array(ExpenseRequestItemSchema).max(100, "费用明细不能超过 100 条")
    .optional(),
  approval_chain: z.array(ExpenseApprovalChainItemSchema).optional(),
});

export const SubmitExpenseRequestSchema = z.object({
  operator_id: z.uuid("无效的提交员工 ID").optional(),
  comment: z.string().trim().max(500, "提交说明过长").nullable().optional(),
  approval_chain: z.array(ExpenseApprovalChainItemSchema).optional(),
});

export const ApproveExpenseRequestSchema = z.object({
  approver_id: z.uuid("无效的审批员工 ID").optional(),
  comment: z.string().trim().max(500, "审批意见过长").nullable().optional(),
});

export const RejectExpenseRequestSchema = z.object({
  approver_id: z.uuid("无效的审批员工 ID").optional(),
  rejected_reason: z.string().trim().min(1, "驳回原因不能为空").max(500, "驳回原因过长").optional(),
  reason: z.string().trim().min(1, "驳回原因不能为空").max(500, "驳回原因过长").optional(),
  comment: z.string().trim().max(500, "审批意见过长").nullable().optional(),
}).superRefine((input, ctx) => {
  if (!input.rejected_reason && !input.reason) {
    ctx.addIssue({
      code: "custom",
      path: ["rejected_reason"],
      message: "驳回原因不能为空",
    });
  }
});

export const CancelExpenseRequestSchema = z.object({
  operator_id: z.uuid("无效的操作员工 ID"),
  comment: z.string().trim().max(500, "撤回说明过长").nullable().optional(),
});

export const PayExpenseRequestSchema = z.object({
  payee_name: z.string().trim().min(1, "收款人不能为空").max(200, "收款人过长"),
  payee_bank: z.string().trim().max(200, "收款银行过长").nullable().optional(),
  payee_account: z.string().trim().max(200, "收款账号过长").nullable().optional(),
  method: ExpenseSettlementMethodSchema,
  paid_amount: z.coerce.number("打款金额必须是数字").positive("打款金额必须大于 0"),
  paid_at: z.string().datetime("无效的打款时间").optional(),
  paid_by: z.uuid("无效的打款登记员工 ID"),
  evidence_images: z.array(z.string().trim().min(1, "打款凭证不能为空"))
    .min(1, "请至少上传一张打款凭证"),
  remark: z.string().trim().max(500, "支付备注过长").nullable().optional(),
});

export const ExpenseRequestListQuerySchema = PaginationQuerySchema.extend({
  employee_id: optionalQueryValue(z.uuid("无效的员工 ID")),
  assignee_id: optionalQueryValue(z.uuid("无效的待处理员工 ID")),
  project_id: optionalQueryValue(z.uuid("无效的项目 ID")),
  status: optionalQueryValue(ExpenseStatusSchema),
  mode: optionalQueryValue(ExpenseModeSchema),
  current_step: optionalQueryValue(ExpenseRequestStepSchema),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
  created_from: optionalQueryValue(z.iso.datetime("无效的开始时间")),
  created_to: optionalQueryValue(z.iso.datetime("无效的结束时间")),
});

export const ExpenseRequestTodoQuerySchema = PaginationQuerySchema.extend({
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
  status: optionalQueryValue(ExpenseStatusSchema),
});

export const ExpenseRequestProjectCandidateQuerySchema = PaginationQuerySchema.extend({
  employee_id: optionalQueryValue(z.uuid("无效的员工 ID")),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
  status: optionalQueryValue(z.string().trim().max(50, "项目状态过长")),
});

export const ExpenseApprovalTemplateQuerySchema = z.object({
  mode: optionalQueryValue(ExpenseModeSchema),
  project_id: optionalQueryValue(z.uuid("无效的项目 ID")),
  total_amount: optionalQueryValue(z.coerce.number("金额必须是数字").min(0, "金额不能为负数")),
});

export const ExpenseApprovalCandidateQuerySchema = PaginationQuerySchema.extend({
  step: ExpenseApprovalCandidateStepSchema,
  applicant_employee_id: optionalQueryValue(z.uuid("无效的申请人 ID")),
  project_id: optionalQueryValue(z.uuid("无效的项目 ID")),
  department_id: optionalQueryValue(z.uuid("无效的部门 ID")),
  mode: optionalQueryValue(ExpenseModeSchema),
  total_amount: optionalQueryValue(z.coerce.number("金额必须是数字").min(0, "金额不能为负数")),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
});

export type ExpenseRequestItemInput = z.infer<typeof ExpenseRequestItemSchema>;
export type CreateExpenseRequestInput = z.infer<typeof CreateExpenseRequestSchema>;
export type UpdateExpenseRequestInput = z.infer<typeof UpdateExpenseRequestSchema>;
export type SubmitExpenseRequestInput = z.infer<typeof SubmitExpenseRequestSchema>;
export type ApproveExpenseRequestInput = z.infer<typeof ApproveExpenseRequestSchema>;
export type RejectExpenseRequestInput = z.infer<typeof RejectExpenseRequestSchema>;
export type CancelExpenseRequestInput = z.infer<typeof CancelExpenseRequestSchema>;
export type PayExpenseRequestInput = z.infer<typeof PayExpenseRequestSchema>;
export type ExpenseRequestListQueryType = z.infer<typeof ExpenseRequestListQuerySchema>;
export type ExpenseRequestTodoQueryType = z.infer<typeof ExpenseRequestTodoQuerySchema>;
export type ExpenseRequestProjectCandidateQueryType = z.infer<
  typeof ExpenseRequestProjectCandidateQuerySchema
>;
export type ExpenseApprovalChainItemInput = z.infer<typeof ExpenseApprovalChainItemSchema>;
export type ExpenseApprovalTemplateQueryType = z.infer<typeof ExpenseApprovalTemplateQuerySchema>;
export type ExpenseApprovalCandidateQueryType = z.infer<typeof ExpenseApprovalCandidateQuerySchema>;
