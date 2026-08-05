import {
  PLATFORM_SERVICE_ACCEPTANCE_PREPARATION_STATUS_VALUES,
  PLATFORM_SERVICE_FULFILLMENT_RECORD_TYPE_VALUES,
  PLATFORM_SERVICE_PAYMENT_STATUS_VALUES,
  PLATFORM_SERVICE_STATUS_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import { IdParamSchema, PaginationQuerySchema } from "./request";

const WorkOrderStatusSchema = z.enum([
  "waiting_assignment",
  "configuring",
  "deploying",
  "training",
  "awaiting_acceptance",
  "rectifying",
  "accepted",
  "active",
  "canceled",
]);

const ExpectedVersionSchema = z.number().int().positive("版本必须大于 0");

const RemarkSchema = z.string().trim()
  .min(1, "备注不能为空")
  .max(1000, "备注不能超过 1000 个字符")
  .optional();

const MetadataSchema = z.record(z.string(), z.unknown()).optional().default({});

const FileIdsSchema = z.array(z.uuid("附件 ID 格式不正确"))
  .max(10, "一次最多绑定 10 个附件")
  .optional()
  .default([]);

export const PlatformServiceOrderListQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
  tenantKeyword: z.string().trim().max(120, "租户关键词不能超过 120 个字符").optional(),
  paymentStatus: z.enum(PLATFORM_SERVICE_PAYMENT_STATUS_VALUES).optional(),
  serviceStatus: z.enum(PLATFORM_SERVICE_STATUS_VALUES).optional(),
  createdFrom: z.iso.datetime({ offset: true, local: true }).optional(),
  createdTo: z.iso.datetime({ offset: true, local: true }).optional(),
}).strict();

export const PlatformServiceWorkOrderListQuerySchema =
  PaginationQuerySchema.extend({
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
    tenantKeyword: z.string().trim().max(120, "租户关键词不能超过 120 个字符").optional(),
    status: WorkOrderStatusSchema.optional(),
    assigneeEmployeeId: z.uuid("负责人 ID 格式不正确").optional(),
  }).strict();

export const PlatformServiceRefundRequestListQuerySchema =
  PaginationQuerySchema.extend({
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
    tenantKeyword: z.string().trim().max(120, "租户关键词不能超过 120 个字符").optional(),
    status: z.enum(["reviewing", "approved", "rejected", "cancelled"]).optional(),
  }).strict();

export const PlatformServiceWorkOrderAssignSchema = z.object({
  assignee_employee_id: z.uuid("负责人 ID 格式不正确"),
  expected_version: ExpectedVersionSchema,
  remark: RemarkSchema,
  metadata: MetadataSchema,
}).strict();

export const PlatformServiceWorkOrderTransitionSchema = z.object({
  to_status: WorkOrderStatusSchema,
  expected_version: ExpectedVersionSchema,
  remark: RemarkSchema,
  metadata: MetadataSchema,
}).strict();

export const PlatformServiceFulfillmentRecordSchema = z.object({
  record_type: z.enum(PLATFORM_SERVICE_FULFILLMENT_RECORD_TYPE_VALUES),
  title: z.string().trim()
    .min(1, "履约标题不能为空")
    .max(120, "履约标题不能超过 120 个字符"),
  content: z.string().trim()
    .min(1, "履约内容不能为空")
    .max(5000, "履约内容不能超过 5000 个字符"),
  occurred_at: z.iso.datetime({ offset: true, local: true }),
  file_ids: FileIdsSchema,
}).strict();

export const PlatformServiceAcceptancePreparationSchema = z.object({
  status: z.enum([
    PLATFORM_SERVICE_ACCEPTANCE_PREPARATION_STATUS_VALUES[0],
    PLATFORM_SERVICE_ACCEPTANCE_PREPARATION_STATUS_VALUES[1],
  ]),
  summary: z.string().trim()
    .min(1, "验收摘要不能为空")
    .max(5000, "验收摘要不能超过 5000 个字符"),
  file_ids: FileIdsSchema,
}).strict();

export const PlatformServiceOverdueAcceptanceConfirmSchema = z.object({
  expected_version: ExpectedVersionSchema,
  remark: z.string().trim()
    .min(1, "确认原因不能为空")
    .max(1000, "确认原因不能超过 1000 个字符"),
  metadata: MetadataSchema,
}).strict();

export const PlatformServiceRefundReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  expected_version: ExpectedVersionSchema,
  review_remark: z.string().trim()
    .min(1, "审核备注不能为空")
    .max(1000, "审核备注不能超过 1000 个字符")
    .optional(),
}).strict();

export const PlatformServiceEntityParamSchema = IdParamSchema;

export type PlatformServiceOrderListQuery =
  z.infer<typeof PlatformServiceOrderListQuerySchema>;
export type PlatformServiceWorkOrderListQuery =
  z.infer<typeof PlatformServiceWorkOrderListQuerySchema>;
export type PlatformServiceRefundRequestListQuery =
  z.infer<typeof PlatformServiceRefundRequestListQuerySchema>;
export type PlatformServiceWorkOrderAssignInput =
  z.infer<typeof PlatformServiceWorkOrderAssignSchema>;
export type PlatformServiceWorkOrderTransitionInput =
  z.infer<typeof PlatformServiceWorkOrderTransitionSchema>;
export type PlatformServiceFulfillmentRecordInput =
  z.infer<typeof PlatformServiceFulfillmentRecordSchema>;
export type PlatformServiceAcceptancePreparationInput =
  z.infer<typeof PlatformServiceAcceptancePreparationSchema>;
export type PlatformServiceOverdueAcceptanceConfirmInput =
  z.infer<typeof PlatformServiceOverdueAcceptanceConfirmSchema>;
export type PlatformServiceRefundReviewInput =
  z.infer<typeof PlatformServiceRefundReviewSchema>;
