import { z } from "zod";

import {
  SUPPLIER_PAYMENT_METHOD_VALUES,
  SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES,
} from "@gooes/domain";

import { PaginationQuerySchema } from "./request";

export const SUPPLIER_PAYABLE_STATUS_VALUES = [
  "open",
  "reserved",
  "partially_paid",
  "paid",
  "overdue",
] as const;

const uuid = (message: string) => z.uuid(message);
const dateTime = z.iso.datetime({
  offset: true,
  message: "日期时间格式无效",
});
const expectedVersion = z.number().int()
  .positive("版本号必须是正整数");
const reason = z.string().trim()
  .min(1, "原因不能为空")
  .max(500, "原因不能超过 500 个字符");
const optionalRemark = z.string().trim()
  .max(500, "备注不能超过 500 个字符")
  .nullable()
  .optional();
const amount = z.string()
  .regex(
    /^(?:0|[1-9]\d{0,15})\.\d{2}$/,
    "金额必须是两位小数且不能超过数据库上限",
  )
  .refine((value) => value !== "0.00", "金额必须大于 0");

export const SupplierPayableStatusSchema = z.enum(
  SUPPLIER_PAYABLE_STATUS_VALUES,
  { message: "无效的应付状态" },
);

export const SupplierPaymentRequestStatusSchema = z.enum(
  SUPPLIER_PAYMENT_REQUEST_STATUS_VALUES,
  { message: "无效的付款申请状态" },
);

export const SupplierPaymentMethodSchema = z.enum(
  SUPPLIER_PAYMENT_METHOD_VALUES,
  { message: "无效的付款方式" },
);

export const SupplierPayableListQuerySchema = PaginationQuerySchema.extend({
  project_id: uuid("无效的项目 ID").optional(),
  tenant_supplier_id: uuid("无效的租户供应商关系 ID").optional(),
  purchase_order_id: uuid("无效的供应商采购单 ID").optional(),
  status: SupplierPayableStatusSchema.optional(),
  due_from: dateTime.optional(),
  due_to: dateTime.optional(),
}).strict().superRefine((input, context) => {
  validateDateRange(
    input.due_from,
    input.due_to,
    ["due_to"],
    "到期结束时间不能早于开始时间",
    context,
  );
});

export const SupplierPayableFilterOptionQuerySchema =
  PaginationQuerySchema.extend({
    type: z.enum(["project", "supplier", "purchase_order"], {
      message: "无效的应付筛选项类型",
    }),
    keyword: z.string().trim()
      .min(1, "筛选项关键词不能为空")
      .max(100, "筛选项关键词不能超过 100 个字符")
      .optional(),
  }).strict();

const SupplierPayableBatchIdsSchema = z.array(
  uuid("无效的应付事件 ID").transform((value) => value.toLowerCase()),
)
  .min(1, "至少需要一个应付事件 ID")
  .max(100, "应付事件 ID 不能超过 100 个")
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "应付事件 ID 不能重复",
      });
    }
  });

export const SupplierPayableBatchQuerySchema = z.object({
  ids: z.string().trim()
    .min(1, "应付事件 ID 不能为空")
    .max(4096, "应付事件 ID 参数过长")
    .transform((value) => value.split(",").map((id) => id.trim()))
    .pipe(SupplierPayableBatchIdsSchema),
}).strict();

export const SupplierPaymentRequestListQuerySchema =
  PaginationQuerySchema.extend({
    project_id: uuid("无效的项目 ID").optional(),
    tenant_supplier_id: uuid("无效的租户供应商关系 ID").optional(),
    status: SupplierPaymentRequestStatusSchema.optional(),
    keyword: z.string().trim()
      .min(1, "关键词不能为空")
      .max(100, "关键词不能超过 100 个字符")
      .optional(),
    created_from: dateTime.optional(),
    created_to: dateTime.optional(),
  }).strict().superRefine((input, context) => {
    validateDateRange(
      input.created_from,
      input.created_to,
      ["created_to"],
      "创建结束时间不能早于开始时间",
      context,
    );
  });

export const SupplierPaymentRequestParamSchema = z.object({
  id: uuid("无效的供应商付款申请 ID"),
}).strict();

export const SupplierPaymentListQuerySchema = PaginationQuerySchema.strict();

export const SupplierPaymentRequestDraftAllocationSchema = z.object({
  payable_event_id: uuid("无效的应付事件 ID"),
  requested_amount: amount,
}).strict();

export const SupplierPaymentRequestDraftSchema = z.object({
  id: uuid("无效的供应商付款申请 ID"),
  project_id: uuid("无效的项目 ID"),
  tenant_supplier_id: uuid("无效的租户供应商关系 ID"),
  expected_version: z.number().int()
    .nonnegative("版本号不能为负数"),
  reason,
  remark: optionalRemark,
  allocations: z.array(SupplierPaymentRequestDraftAllocationSchema)
    .min(1, "付款申请至少需要一个应付分配")
    .max(100, "付款申请分配不能超过 100 行"),
}).strict().superRefine((input, context) => {
  addDuplicateIdIssues(
    input.allocations,
    "payable_event_id",
    ["allocations"],
    "同一应付事件不能重复分配",
    context,
  );
});

export const SupplierPaymentRequestSubmitSchema = z.object({
  expected_version: expectedVersion,
}).strict();

export const SupplierPaymentRequestReviewSchema = z.object({
  expected_version: expectedVersion,
  remark: optionalRemark,
}).strict();

export const SupplierPaymentRequestCancelSchema = z.object({
  expected_version: expectedVersion,
  reason,
}).strict();

export const SupplierPaymentRequestCloseSchema = z.object({
  expected_version: expectedVersion,
  reason,
}).strict();

export const SupplierPaymentAllocationInputSchema = z.object({
  payment_request_allocation_id: uuid("无效的付款申请分配 ID"),
  payable_event_id: uuid("无效的应付事件 ID"),
  amount,
}).strict();

export const SupplierPaymentConfirmSchema = z.object({
  id: uuid("无效的供应商付款 ID"),
  expected_version: expectedVersion,
  payment_method: SupplierPaymentMethodSchema,
  payment_reference: z.string().trim()
    .min(1, "付款流水号不能为空")
    .max(200, "付款流水号不能超过 200 个字符"),
  paid_at: dateTime,
  evidence_images: z.array(
    z.string().trim()
      .min(1, "付款凭证不能为空")
      .max(2048, "付款凭证标识不能超过 2048 个字符"),
  )
    .min(1, "至少需要一张付款凭证")
    .max(9, "付款凭证不能超过 9 张"),
  remark: optionalRemark,
  allocations: z.array(SupplierPaymentAllocationInputSchema)
    .min(1, "付款至少需要一个分配")
    .max(100, "付款分配不能超过 100 行"),
}).strict().superRefine((input, context) => {
  if (
    input.payment_method === "other" &&
    (input.remark === undefined || input.remark === null ||
      input.remark.length === 0)
  ) {
    context.addIssue({
      code: "custom",
      path: ["remark"],
      message: "其他付款方式必须填写备注",
    });
  }
  addDuplicateIdIssues(
    input.allocations,
    "payment_request_allocation_id",
    ["allocations"],
    "同一付款申请分配不能重复",
    context,
  );
  addDuplicateIdIssues(
    input.allocations,
    "payable_event_id",
    ["allocations"],
    "同一应付事件不能重复付款",
    context,
  );
});

function validateDateRange(
  from: string | undefined,
  to: string | undefined,
  path: PropertyKey[],
  message: string,
  context: z.RefinementCtx,
): void {
  if (from !== undefined && to !== undefined && Date.parse(from) > Date.parse(to)) {
    context.addIssue({ code: "custom", path, message });
  }
}

function addDuplicateIdIssues<
  Key extends string,
  Item extends Record<Key, string>,
>(
  items: Item[],
  key: Key,
  path: PropertyKey[],
  message: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const normalizedId = item[key].toLowerCase();
    if (seen.has(normalizedId)) {
      context.addIssue({
        code: "custom",
        path: [...path, index, key],
        message,
      });
    }
    seen.add(normalizedId);
  });
}

export type SupplierPayableStatus =
  z.infer<typeof SupplierPayableStatusSchema>;
export type SupplierPaymentRequestStatus =
  z.infer<typeof SupplierPaymentRequestStatusSchema>;
export type SupplierPaymentMethod =
  z.infer<typeof SupplierPaymentMethodSchema>;
export type SupplierPayableListQuery =
  z.infer<typeof SupplierPayableListQuerySchema>;
export type SupplierPayableFilterOptionQuery =
  z.infer<typeof SupplierPayableFilterOptionQuerySchema>;
export type SupplierPayableBatchQuery =
  z.infer<typeof SupplierPayableBatchQuerySchema>;
export type SupplierPaymentRequestListQuery =
  z.infer<typeof SupplierPaymentRequestListQuerySchema>;
export type SupplierPaymentRequestParam =
  z.infer<typeof SupplierPaymentRequestParamSchema>;
export type SupplierPaymentListQuery =
  z.infer<typeof SupplierPaymentListQuerySchema>;
export type SupplierPaymentRequestDraftAllocation =
  z.infer<typeof SupplierPaymentRequestDraftAllocationSchema>;
export type SupplierPaymentRequestDraftInput =
  z.infer<typeof SupplierPaymentRequestDraftSchema>;
export type SupplierPaymentRequestSubmitInput =
  z.infer<typeof SupplierPaymentRequestSubmitSchema>;
export type SupplierPaymentRequestReviewInput =
  z.infer<typeof SupplierPaymentRequestReviewSchema>;
export type SupplierPaymentRequestCancelInput =
  z.infer<typeof SupplierPaymentRequestCancelSchema>;
export type SupplierPaymentRequestCloseInput =
  z.infer<typeof SupplierPaymentRequestCloseSchema>;
export type SupplierPaymentAllocationInput =
  z.infer<typeof SupplierPaymentAllocationInputSchema>;
export type SupplierPaymentConfirmInput =
  z.infer<typeof SupplierPaymentConfirmSchema>;
