import { DOUYIN_APPOINTMENT_STATUS_VALUES, DOUYIN_VISIT_PERIOD_VALUES } from
  "@gooes/domain";
import { z } from "zod";

const DateTimeSchema = z.iso.datetime({ offset: true });
const NullableUuidSchema = z.uuid().nullable();
const NullableStringSchema = z.string().nullable();
const LeadStatusSchema = z.enum(["new", "contacted", "converted", "invalid"]);

export const TenantDouyinLeadRowSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  douyin_miniapp_installation_id: NullableUuidSchema,
  customer_id: NullableUuidSchema,
  assigned_employee_id: NullableUuidSchema,
  name: NullableStringSchema,
  phone: NullableStringSchema,
  community: NullableStringSchema,
  lead_status: LeadStatusSchema,
  form_data: z.record(z.string(), z.unknown()),
  created_at: DateTimeSchema,
  followed_at: DateTimeSchema.nullable(),
  follow_remark: NullableStringSchema,
  version: z.int().min(1),
});

export const TenantDouyinAppointmentRowSchema = z.strictObject({
  id: z.uuid(),
  appointment_no: z.string().trim().min(1).max(40),
  tenant_id: z.uuid(),
  marketing_lead_id: z.uuid(),
  customer_id: NullableUuidSchema,
  assigned_employee_id: NullableUuidSchema,
  budget_estimate_id: NullableUuidSchema,
  preferred_visit_date: z.iso.date(),
  preferred_visit_period: z.enum(DOUYIN_VISIT_PERIOD_VALUES),
  community: z.string().trim().min(1).max(80),
  status: z.enum(DOUYIN_APPOINTMENT_STATUS_VALUES),
  confirmed_visit_at: DateTimeSchema.nullable(),
  source_snapshot: z.record(z.string(), z.unknown()),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
  version: z.int().min(1),
});

export const TenantDouyinCustomerRowSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  name: NullableStringSchema,
  status: NullableStringSchema,
  owner_id: NullableUuidSchema,
});

export const TenantDouyinEmployeeRowSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  name: NullableStringSchema,
  avatar: NullableStringSchema,
  status: NullableStringSchema,
});

export const TenantDouyinFollowUpRowSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  marketing_lead_id: z.uuid(),
  douyin_measurement_appointment_id: z.uuid(),
  employee_id: z.uuid(),
  follow_up_type: z.enum([
    "phone", "wechat", "online_meeting", "onsite", "other",
  ]),
  summary: z.string().trim().min(1).max(500),
  result: z.string().trim().min(1).max(1000),
  next_follow_up_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
});

const COMMAND_ERROR_CODE_VALUES = [
  "DOUYIN_LEAD_ACTOR_NOT_FOUND",
  "DOUYIN_LEAD_APPOINTMENT_CUSTOMER_CONFLICT",
  "DOUYIN_LEAD_ASSIGNEE_NOT_FOUND",
  "DOUYIN_LEAD_ASSIGN_COMMAND_INVALID",
  "DOUYIN_LEAD_CONVERSION_STATE_INVALID",
  "DOUYIN_LEAD_CONVERTED_NOT_INVALIDATABLE",
  "DOUYIN_LEAD_CONVERT_COMMAND_INVALID",
  "DOUYIN_LEAD_CUSTOMER_UPSERT_FAILED",
  "DOUYIN_LEAD_FOLLOW_UP_COMMAND_INVALID",
  "DOUYIN_LEAD_IDEMPOTENCY_CONFLICT",
  "DOUYIN_LEAD_INVALID_COMMAND_INVALID",
  "DOUYIN_LEAD_INVALID_NOT_CONVERTIBLE",
  "DOUYIN_LEAD_NOT_ASSIGNABLE",
  "DOUYIN_LEAD_NOT_FOLLOWABLE",
  "DOUYIN_LEAD_NOT_FOUND",
  "DOUYIN_LEAD_PHONE_CONFLICT",
  "DOUYIN_LEAD_VERSION_CONFLICT",
  "DOUYIN_MEASUREMENT_APPOINTMENT_NOT_FOUND",
  "DOUYIN_MEASUREMENT_APPOINTMENT_TRANSITION_INVALID",
] as const;
const CommandErrorCodeSchema = z.enum(COMMAND_ERROR_CODE_VALUES);
type CommandErrorCode = (typeof COMMAND_ERROR_CODE_VALUES)[number];
const COMMAND_ERROR_STATUS = {
  DOUYIN_LEAD_ASSIGN_COMMAND_INVALID: 400,
  DOUYIN_LEAD_CONVERT_COMMAND_INVALID: 400,
  DOUYIN_LEAD_FOLLOW_UP_COMMAND_INVALID: 400,
  DOUYIN_LEAD_INVALID_COMMAND_INVALID: 400,
  DOUYIN_LEAD_ACTOR_NOT_FOUND: 404,
  DOUYIN_LEAD_ASSIGNEE_NOT_FOUND: 404,
  DOUYIN_LEAD_NOT_FOUND: 404,
  DOUYIN_MEASUREMENT_APPOINTMENT_NOT_FOUND: 404,
  DOUYIN_LEAD_CONVERSION_STATE_INVALID: 500,
  DOUYIN_LEAD_CUSTOMER_UPSERT_FAILED: 500,
  DOUYIN_LEAD_APPOINTMENT_CUSTOMER_CONFLICT: 409,
  DOUYIN_LEAD_CONVERTED_NOT_INVALIDATABLE: 409,
  DOUYIN_LEAD_IDEMPOTENCY_CONFLICT: 409,
  DOUYIN_LEAD_INVALID_NOT_CONVERTIBLE: 409,
  DOUYIN_LEAD_NOT_ASSIGNABLE: 409,
  DOUYIN_LEAD_NOT_FOLLOWABLE: 409,
  DOUYIN_LEAD_PHONE_CONFLICT: 409,
  DOUYIN_LEAD_VERSION_CONFLICT: 409,
  DOUYIN_MEASUREMENT_APPOINTMENT_TRANSITION_INVALID: 409,
} as const satisfies Readonly<Record<CommandErrorCode, 400 | 404 | 409 | 500>>;
export const TenantDouyinLeadCommandErrorSchema = z.strictObject({
  status_code: z.union([
    z.literal(400), z.literal(404), z.literal(409), z.literal(500),
  ]),
  code: CommandErrorCodeSchema,
}).superRefine((error, context) => {
  if (error.status_code !== COMMAND_ERROR_STATUS[error.code]) {
    context.addIssue({
      code: "custom",
      path: ["status_code"],
      message: "命令错误状态与错误码不匹配",
    });
  }
});

const CommandBaseShape = {
  lead_id: z.uuid(),
  lead_version: z.int().min(1),
  idempotent: z.boolean(),
};
export const TenantDouyinLeadCommandDataSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("assign"), result: z.literal("assigned"),
    assigned_employee_id: z.uuid(), appointments_updated: z.int().min(0),
    ...CommandBaseShape,
  }),
  z.strictObject({
    action: z.literal("follow_up"), result: z.literal("followed_up"),
    follow_up_id: z.uuid(), appointment_id: z.uuid(),
    appointment_version: z.int().min(1),
    appointment_status: z.enum(DOUYIN_APPOINTMENT_STATUS_VALUES),
    ...CommandBaseShape,
  }),
  z.strictObject({
    action: z.literal("convert"), result: z.literal("converted"),
    customer_id: z.uuid(), created_customer: z.boolean(),
    repeated_conversion: z.boolean(), ...CommandBaseShape,
  }),
  z.strictObject({
    action: z.literal("mark_invalid"), result: z.literal("invalid"),
    appointments_updated: z.int().min(0), repeated_invalidation: z.boolean(),
    ...CommandBaseShape,
  }),
]);

export const TenantDouyinLeadCommandEnvelopeSchema = z.union([
  z.strictObject({ data: TenantDouyinLeadCommandDataSchema }),
  z.strictObject({ error: TenantDouyinLeadCommandErrorSchema }),
]);

export type TenantDouyinLeadRow = z.infer<typeof TenantDouyinLeadRowSchema>;
export type TenantDouyinAppointmentRow = z.infer<
  typeof TenantDouyinAppointmentRowSchema
>;
export type TenantDouyinCustomerRow = z.infer<
  typeof TenantDouyinCustomerRowSchema
>;
export type TenantDouyinEmployeeRow = z.infer<
  typeof TenantDouyinEmployeeRowSchema
>;
export type TenantDouyinFollowUpRow = z.infer<
  typeof TenantDouyinFollowUpRowSchema
>;
export type TenantDouyinLeadCommandData = z.infer<
  typeof TenantDouyinLeadCommandDataSchema
>;
export type TenantDouyinLeadCommandError = z.infer<
  typeof TenantDouyinLeadCommandErrorSchema
>;
export type TenantDouyinLeadCommandResult =
  | { readonly ok: true; readonly data: TenantDouyinLeadCommandData }
  | { readonly ok: false; readonly error: TenantDouyinLeadCommandError };
