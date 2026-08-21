import { z } from 'zod';

export const DOUYIN_VISIT_PERIOD_VALUES = [
  'morning',
  'afternoon',
  'evening',
] as const;

export const DOUYIN_APPOINTMENT_STATUS_VALUES = [
  'pending_confirmation',
  'confirmed',
  'completed',
  'canceled',
  'invalid',
] as const;

export const DOUYIN_LEAD_ACTION_VALUES = [
  'assign',
  'follow_up',
  'convert',
  'mark_invalid',
] as const;

export const DOUYIN_LEAD_ACTION_RESULT_VALUES = [
  'assigned',
  'followed_up',
  'converted',
  'invalid',
] as const;

export type DouyinVisitPeriod =
  (typeof DOUYIN_VISIT_PERIOD_VALUES)[number];
export type DouyinAppointmentStatus =
  (typeof DOUYIN_APPOINTMENT_STATUS_VALUES)[number];
export type DouyinLeadAction = (typeof DOUYIN_LEAD_ACTION_VALUES)[number];
export type DouyinLeadActionResultValue =
  (typeof DOUYIN_LEAD_ACTION_RESULT_VALUES)[number];

export const DouyinVisitPeriodSchema = z.enum(DOUYIN_VISIT_PERIOD_VALUES);
export const DouyinAppointmentStatusSchema = z.enum(
  DOUYIN_APPOINTMENT_STATUS_VALUES,
);

export const DOUYIN_APPOINTMENT_TRANSITIONS = {
  pending_confirmation: ['confirmed', 'canceled', 'invalid'],
  confirmed: ['completed', 'canceled', 'invalid'],
  completed: [],
  canceled: [],
  invalid: [],
} as const satisfies Readonly<
  Record<DouyinAppointmentStatus, readonly DouyinAppointmentStatus[]>
>;

export const DouyinLeadActionResultSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('assign'),
    result: z.literal('assigned'),
  }),
  z.strictObject({
    action: z.literal('follow_up'),
    result: z.literal('followed_up'),
  }),
  z.strictObject({
    action: z.literal('convert'),
    result: z.literal('converted'),
  }),
  z.strictObject({
    action: z.literal('mark_invalid'),
    result: z.literal('invalid'),
  }),
]);

export type DouyinLeadActionResult = Readonly<
  z.infer<typeof DouyinLeadActionResultSchema>
>;

export function canTransitionDouyinAppointment(
  from: DouyinAppointmentStatus,
  to: DouyinAppointmentStatus,
): boolean {
  return DOUYIN_APPOINTMENT_TRANSITIONS[from].some(
    (allowedStatus) => allowedStatus === to,
  );
}
