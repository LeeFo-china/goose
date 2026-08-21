import { DOUYIN_APPOINTMENT_STATUS_VALUES } from "@gooes/domain";
import { z } from "zod";

const LEAD_STATUS_VALUES = ["new", "contacted", "converted", "invalid"] as const;
const FOLLOW_UP_TYPE_VALUES = [
  "phone",
  "wechat",
  "online_meeting",
  "onsite",
  "other",
] as const;
const FOLLOW_UP_APPOINTMENT_STATUS_VALUES = [
  "confirmed",
  "completed",
  "canceled",
  "invalid",
] as const;
const KeywordSchema = z.string().trim().min(1).max(80).regex(
  /^[\p{L}\p{N}\s#号栋室-]+$/u,
  "关键词包含不支持的字符",
);

export const TenantDouyinLeadListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(LEAD_STATUS_VALUES).optional(),
  assigneeId: z.uuid("无效的负责人 ID").optional(),
  dateFrom: z.iso.date("开始日期格式无效").optional(),
  dateTo: z.iso.date("结束日期格式无效").optional(),
  keyword: KeywordSchema.optional(),
}).refine(
  (input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo,
  { path: ["dateTo"], message: "结束日期不能早于开始日期" },
);

export const TenantDouyinLeadFollowUpListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const TenantDouyinLeadAssigneeCandidatesQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.preprocess((value) => typeof value === "string"
    && value.trim() === "" ? undefined : value,
  z.string().trim().max(100).optional()),
});
export const TenantDouyinLeadAssigneeFilterOptionsQuerySchema =
  TenantDouyinLeadAssigneeCandidatesQuerySchema.extend({
    includeEmployeeId: z.uuid("无效的负责人 ID").optional(),
  });

export const TenantDouyinLeadParamsSchema = z.strictObject({
  id: z.uuid("无效的抖音线索 ID"),
});

export const TenantDouyinLeadEmptyQuerySchema = z.strictObject({});

const IdempotentLeadCommandShape = {
  expected_lead_version: z.int().min(1).max(2_147_483_647),
  idempotency_key: z.uuid("无效的幂等键"),
};

export const TenantDouyinLeadAssignSchema = z.strictObject({
  assigned_employee_id: z.uuid("无效的负责人 ID"),
  ...IdempotentLeadCommandShape,
});

export const TenantDouyinLeadFollowUpSchema = z.strictObject({
  appointment_id: z.uuid("无效的量房预约 ID"),
  follow_up_type: z.enum(FOLLOW_UP_TYPE_VALUES),
  summary: z.string().trim().min(1).max(500),
  result: z.string().trim().min(1).max(1000),
  next_follow_up_at: z.iso.datetime({ offset: true }).nullable().default(null),
  appointment_status: z.enum(FOLLOW_UP_APPOINTMENT_STATUS_VALUES)
    .nullable().default(null),
  confirmed_visit_at: z.iso.datetime({ offset: true }).nullable().default(null),
  ...IdempotentLeadCommandShape,
}).superRefine((input, context) => {
  const needsConfirmedVisit = input.appointment_status === "confirmed";
  if (needsConfirmedVisit !== (input.confirmed_visit_at !== null)) {
    context.addIssue({
      code: "custom",
      path: ["confirmed_visit_at"],
      message: needsConfirmedVisit
        ? "确认量房时必须填写确认时间"
        : "仅确认量房时允许填写确认时间",
    });
  }
});

export const TenantDouyinLeadConvertSchema = z.strictObject({
  ...IdempotentLeadCommandShape,
});

export const TenantDouyinLeadMarkInvalidSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
  ...IdempotentLeadCommandShape,
});

export const TenantDouyinAppointmentStatusSchema = z.enum(
  DOUYIN_APPOINTMENT_STATUS_VALUES,
);

export type TenantDouyinLeadListQuery = z.infer<
  typeof TenantDouyinLeadListQuerySchema
>;
export type TenantDouyinLeadListQueryInput = z.input<
  typeof TenantDouyinLeadListQuerySchema
>;
export type TenantDouyinLeadFollowUpListQuery = z.infer<
  typeof TenantDouyinLeadFollowUpListQuerySchema
>;
export type TenantDouyinLeadFollowUpListQueryInput = z.input<
  typeof TenantDouyinLeadFollowUpListQuerySchema
>;
export type TenantDouyinLeadAssigneeCandidatesQuery = z.infer<
  typeof TenantDouyinLeadAssigneeCandidatesQuerySchema
>;
export type TenantDouyinLeadAssigneeCandidatesQueryInput = z.input<
  typeof TenantDouyinLeadAssigneeCandidatesQuerySchema
>;
export type TenantDouyinLeadAssigneeFilterOptionsQuery = z.infer<
  typeof TenantDouyinLeadAssigneeFilterOptionsQuerySchema
>;
export type TenantDouyinLeadAssigneeFilterOptionsQueryInput = z.input<
  typeof TenantDouyinLeadAssigneeFilterOptionsQuerySchema
>;
export type TenantDouyinLeadAssign = z.infer<
  typeof TenantDouyinLeadAssignSchema
>;
export type TenantDouyinLeadFollowUp = z.infer<
  typeof TenantDouyinLeadFollowUpSchema
>;
export type TenantDouyinLeadConvert = z.infer<
  typeof TenantDouyinLeadConvertSchema
>;
export type TenantDouyinLeadMarkInvalid = z.infer<
  typeof TenantDouyinLeadMarkInvalidSchema
>;
