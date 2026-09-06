import { z } from 'zod';

import {
  CUSTOMER_LEAD_APPOINTMENT_STATUS_VALUES,
  CUSTOMER_LEAD_FOLLOW_UP_TYPE_VALUES,
} from './customer-lead';

const VersionSchema = z.int().min(1).max(2_147_483_647);
const DateTimeSchema = z.iso.datetime({ offset: true });
export const CustomerLeadCommandInputSchema = z.strictObject({
  expected_lead_version: VersionSchema,
  idempotency_key: z.uuid('无效的幂等键'),
});
export const CustomerLeadAssignSchema = z.strictObject({
  ...CustomerLeadCommandInputSchema.shape,
  assigned_employee_id: z.uuid('无效的负责人 ID'),
});
export const CustomerLeadConvertSchema = CustomerLeadCommandInputSchema;
export const CustomerLeadMarkInvalidSchema = z.strictObject({
  ...CustomerLeadCommandInputSchema.shape,
  reason: z.string().trim().min(1).max(500),
});
export const CustomerLeadFollowUpSchema = z.strictObject({
  ...CustomerLeadCommandInputSchema.shape,
  appointment_id: z.uuid('无效的量房预约 ID').nullable().default(null),
  follow_up_type: z.enum(CUSTOMER_LEAD_FOLLOW_UP_TYPE_VALUES),
  summary: z.string().trim().min(1).max(500),
  result: z.string().trim().min(1).max(1000),
  next_follow_up_at: DateTimeSchema.nullable().default(null),
  appointment_status: z.enum(['confirmed', 'completed', 'canceled', 'invalid'])
    .nullable().default(null),
  confirmed_visit_at: DateTimeSchema.nullable().default(null),
}).superRefine((input, context) => {
  if (input.appointment_id === null && input.appointment_status !== null) {
    context.addIssue({
      code: 'custom', path: ['appointment_id'], message: '修改量房状态必须关联预约',
    });
  }
  if ((input.appointment_status === 'confirmed') !== (input.confirmed_visit_at !== null)) {
    context.addIssue({
      code: 'custom', path: ['confirmed_visit_at'],
      message: input.appointment_status === 'confirmed'
        ? '确认量房时必须填写确认时间' : '仅确认量房时允许填写确认时间',
    });
  }
});

const CommandResultShape = {
  lead_id: z.uuid(),
  lead_version: VersionSchema,
  idempotent: z.boolean(),
};
const FollowUpResultSchema = z.strictObject({
  ...CommandResultShape,
  action: z.literal('follow_up'), result: z.literal('followed_up'),
  follow_up_id: z.uuid(), appointment_id: z.uuid().nullable(),
  appointment_version: VersionSchema.nullable(),
  appointment_status: z.enum(CUSTOMER_LEAD_APPOINTMENT_STATUS_VALUES).nullable(),
}).superRefine((input, context) => {
  const hasAppointment = input.appointment_id !== null;
  if (hasAppointment !== (input.appointment_version !== null)
    || hasAppointment !== (input.appointment_status !== null)) {
    context.addIssue({
      code: 'custom', path: ['appointment_id'], message: '预约结果字段必须同时为空或同时存在',
    });
  }
});
const ConvertResultSchema = z.strictObject({
  ...CommandResultShape,
  action: z.literal('convert'), result: z.literal('converted'),
  customer_id: z.uuid().nullable(), can_view_customer: z.boolean(),
  created_customer: z.boolean(), repeated_conversion: z.boolean(),
  appointments_updated: z.int().min(0),
}).superRefine((input, context) => {
  if (input.can_view_customer !== (input.customer_id !== null)) {
    context.addIssue({
      code: 'custom', path: ['customer_id'], message: '客户关联必须符合客户查看权限',
    });
  }
  if (input.created_customer && input.repeated_conversion) {
    context.addIssue({
      code: 'custom', path: ['created_customer'], message: '重复转化不能同时创建客户',
    });
  }
});
export const CustomerLeadCommandResultSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ...CommandResultShape,
    action: z.literal('assign'), result: z.literal('assigned'),
    assigned_employee_id: z.uuid(), appointments_updated: z.int().min(0),
  }),
  FollowUpResultSchema,
  ConvertResultSchema,
  z.strictObject({
    ...CommandResultShape,
    action: z.literal('mark_invalid'), result: z.literal('invalid'),
    appointments_updated: z.int().min(0), repeated_invalidation: z.boolean(),
  }),
]);

export type CustomerLeadCommandInput = z.input<typeof CustomerLeadCommandInputSchema>;
export type CustomerLeadAssignInput = z.input<typeof CustomerLeadAssignSchema>;
export type CustomerLeadConvertInput = z.input<typeof CustomerLeadConvertSchema>;
export type CustomerLeadMarkInvalidInput = z.input<typeof CustomerLeadMarkInvalidSchema>;
export type CustomerLeadFollowUpInput = z.input<typeof CustomerLeadFollowUpSchema>;
export type CustomerLeadFollowUpCommand = z.output<typeof CustomerLeadFollowUpSchema>;
export type CustomerLeadCommandResult = z.output<typeof CustomerLeadCommandResultSchema>;
