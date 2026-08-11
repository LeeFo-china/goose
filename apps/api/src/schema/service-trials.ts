import {
  PLATFORM_SERVICE_TRIAL_SOURCE_VALUES,
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  PLATFORM_SERVICE_TRIAL_TYPE_VALUES,
  PlatformServiceTrialScopeSchema,
} from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const IdempotencyKeySchema = z.uuidv4('幂等键必须是 UUID v4');
const ExpectedVersionSchema = z.number().int().positive('版本必须大于 0');
const ReasonSchema = z
  .string()
  .trim()
  .min(1, '原因不能为空')
  .max(500, '原因不能超过 500 个字符');
const TrialDaysSchema = z
  .number()
  .int()
  .min(1, '试用天数不能少于 1 天')
  .max(60, '试用天数不能超过 60 天');
const GraceDaysSchema = z
  .number()
  .int()
  .min(0, '宽限期天数不能小于 0')
  .max(14, '宽限期天数不能超过 14 天');
const DateTimeSchema = z.iso.datetime({ offset: true });
const AssigneeEmployeeIdSchema = z
  .uuid('无效的平台跟进人 ID')
  .nullable()
  .optional();

const addGuidedAssigneeIssue = (
  input: { trial_type: 'standard' | 'guided'; assignee_employee_id?: string | null },
  context: z.RefinementCtx,
) => {
  if (input.trial_type === 'guided' && !input.assignee_employee_id) {
    context.addIssue({
      code: 'custom',
      path: ['assignee_employee_id'],
      message: '陪跑试用必须指定平台跟进人',
    });
  }
};

export const ServiceTrialApplicationCreateSchema = z
  .object({
    application_reason: z
      .string()
      .trim()
      .min(1, '试用目的不能为空')
      .max(1000, '试用目的不能超过 1000 个字符'),
    expected_user_count: z
      .number()
      .int()
      .min(1, '预计使用人数必须大于 0')
      .max(10_000, '预计使用人数不能超过 10000'),
    expected_project_count: z
      .number()
      .int()
      .min(1, '预计项目数量必须大于 0')
      .max(100_000, '预计项目数量不能超过 100000'),
    contact_name: z
      .string()
      .trim()
      .min(1, '联系人不能为空')
      .max(60, '联系人不能超过 60 个字符'),
    contact_phone: z
      .string()
      .trim()
      .regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
    idempotency_key: IdempotencyKeySchema,
  })
  .strict();

const VersionedReasonCommandSchema = z
  .object({
    idempotency_key: IdempotencyKeySchema,
    expected_version: ExpectedVersionSchema,
    reason: ReasonSchema,
  })
  .strict();

export const ServiceTrialWithdrawSchema = VersionedReasonCommandSchema;

export const ServiceTrialListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).optional(),
}).strict();

export const PlatformServiceTrialListQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().max(120, '关键词不能超过 120 个字符').optional(),
  status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).optional(),
  source: z.enum(PLATFORM_SERVICE_TRIAL_SOURCE_VALUES).optional(),
  trialType: z.enum(PLATFORM_SERVICE_TRIAL_TYPE_VALUES).optional(),
  assigneeEmployeeId: z.uuid('无效的平台跟进人 ID').optional(),
  appliedFrom: DateTimeSchema.optional(),
  appliedTo: DateTimeSchema.optional(),
  expiresFrom: DateTimeSchema.optional(),
  expiresTo: DateTimeSchema.optional(),
}).strict();

export const ServiceTrialParamSchema = z
  .object({
    id: z.uuid('无效的技术服务试用 ID'),
  })
  .strict();

export const PlatformServiceTrialGrantSchema = z
  .object({
    tenant_id: z.uuid('无效的租户 ID'),
    trial_type: z.enum(PLATFORM_SERVICE_TRIAL_TYPE_VALUES),
    starts_at: DateTimeSchema.optional(),
    trial_days: TrialDaysSchema.optional(),
    grace_days: GraceDaysSchema.optional(),
    scope: PlatformServiceTrialScopeSchema.optional(),
    assignee_employee_id: AssigneeEmployeeIdSchema,
    reason: ReasonSchema,
    idempotency_key: IdempotencyKeySchema,
  })
  .strict()
  .superRefine(addGuidedAssigneeIssue);

const PlatformServiceTrialApprovedReviewSchema = z
  .object({
    decision: z.literal('approved'),
    expected_version: ExpectedVersionSchema,
    idempotency_key: IdempotencyKeySchema,
    reason: ReasonSchema,
    trial_type: z.enum(PLATFORM_SERVICE_TRIAL_TYPE_VALUES),
    starts_at: DateTimeSchema.optional(),
    trial_days: TrialDaysSchema.optional(),
    grace_days: GraceDaysSchema.optional(),
    scope: PlatformServiceTrialScopeSchema.optional(),
    assignee_employee_id: AssigneeEmployeeIdSchema,
  })
  .strict();

const PlatformServiceTrialRejectedReviewSchema = z
  .object({
    decision: z.literal('rejected'),
    expected_version: ExpectedVersionSchema,
    idempotency_key: IdempotencyKeySchema,
    reason: ReasonSchema,
  })
  .strict();

export const PlatformServiceTrialReviewSchema = z
  .discriminatedUnion('decision', [
    PlatformServiceTrialApprovedReviewSchema,
    PlatformServiceTrialRejectedReviewSchema,
  ])
  .superRefine((input, context) => {
    if (input.decision === 'approved') {
      addGuidedAssigneeIssue(input, context);
    }
  });

export const PlatformServiceTrialExtendSchema = VersionedReasonCommandSchema.extend({
  extension_days: z
    .number()
    .int()
    .min(1, '延期天数不能少于 1 天')
    .max(30, '延期天数不能超过 30 天'),
}).strict();

export const PlatformServiceTrialRevokeSchema = VersionedReasonCommandSchema;

export const PlatformServiceTrialAssignSchema = z
  .object({
    assignee_employee_id: z.uuid('无效的平台跟进人 ID').nullable(),
    expected_version: ExpectedVersionSchema,
    idempotency_key: IdempotencyKeySchema,
  })
  .strict();

const ReminderDaysSchema = z
  .array(z.number().int().min(1).max(30))
  .min(1, '至少需要配置一个提醒日期')
  .max(30, '提醒日期不能超过 30 个')
  .refine(
    (days) => new Set(days).size === days.length,
    '提醒日期不能重复',
  )
  .refine(
    (days) => days.every((day, index) => index === 0 || days[index - 1]! > day),
    '提醒日期必须按从大到小排序',
  );

export const PlatformServiceTrialPolicyUpdateSchema = z
  .object({
    default_trial_days: TrialDaysSchema,
    default_grace_days: GraceDaysSchema,
    max_trial_days: TrialDaysSchema,
    max_grace_days: GraceDaysSchema,
    max_schedule_ahead_days: z.number().int().min(0).max(30),
    max_extension_count: z.number().int().min(0).max(10),
    max_extension_days: z.number().int().min(1).max(30),
    reminder_days: ReminderDaysSchema,
    reapply_cooldown_days: z.number().int().min(0).max(365),
    allow_repeat_application: z.boolean(),
    standard_scope: PlatformServiceTrialScopeSchema,
    guided_scope: PlatformServiceTrialScopeSchema,
    expected_version: ExpectedVersionSchema,
    idempotency_key: IdempotencyKeySchema,
    reason: ReasonSchema,
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.default_trial_days > policy.max_trial_days) {
      context.addIssue({
        code: 'custom',
        path: ['default_trial_days'],
        message: '默认试用天数不能超过最大试用天数',
      });
    }
    if (policy.default_grace_days > policy.max_grace_days) {
      context.addIssue({
        code: 'custom',
        path: ['default_grace_days'],
        message: '默认宽限期不能超过最大宽限期',
      });
    }
    if (policy.reminder_days.some((day) => day > policy.default_trial_days)) {
      context.addIssue({
        code: 'custom',
        path: ['reminder_days'],
        message: '提醒日期不能超过默认试用天数',
      });
    }
  });

export type ServiceTrialApplicationCreateInput =
  z.infer<typeof ServiceTrialApplicationCreateSchema>;
export type ServiceTrialWithdrawInput = z.infer<typeof ServiceTrialWithdrawSchema>;
export type ServiceTrialListQuery = z.infer<typeof ServiceTrialListQuerySchema>;
export type PlatformServiceTrialListQuery =
  z.infer<typeof PlatformServiceTrialListQuerySchema>;
export type PlatformServiceTrialGrantInput =
  z.infer<typeof PlatformServiceTrialGrantSchema>;
export type PlatformServiceTrialReviewInput =
  z.infer<typeof PlatformServiceTrialReviewSchema>;
export type PlatformServiceTrialExtendInput =
  z.infer<typeof PlatformServiceTrialExtendSchema>;
export type PlatformServiceTrialRevokeInput =
  z.infer<typeof PlatformServiceTrialRevokeSchema>;
export type PlatformServiceTrialAssignInput =
  z.infer<typeof PlatformServiceTrialAssignSchema>;
export type PlatformServiceTrialPolicyUpdateInput =
  z.infer<typeof PlatformServiceTrialPolicyUpdateSchema>;
