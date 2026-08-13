import {
  SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES,
  SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES,
} from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

export const SERVICE_TRIAL_FOLLOW_UP_SUMMARY_MAX_LENGTH = 500;
export const SERVICE_TRIAL_FOLLOW_UP_RESULT_MAX_LENGTH = 1000;

const IdempotencyKeySchema = z.uuidv4('幂等键必须是 UUID v4');
const NextFollowUpAtSchema = z.iso.datetime({ offset: true }).nullable().optional();
const CreateFollowUpStatusSchema = z
  .enum(SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES)
  .exclude(['canceled']);

export const ServiceTrialFollowUpParamSchema = z.object({
  id: z.uuid('无效的试用 ID'),
  followUpId: z.uuid('无效的跟进 ID'),
}).strict();

export const ServiceTrialFollowUpListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES).optional(),
}).strict();

export const CreateServiceTrialFollowUpSchema = z
  .object({
    follow_up_type: z.enum(SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES),
    status: CreateFollowUpStatusSchema.default('completed'),
    summary: z
      .string()
      .trim()
      .min(1, '跟进摘要不能为空')
      .max(
        SERVICE_TRIAL_FOLLOW_UP_SUMMARY_MAX_LENGTH,
        `跟进摘要不能超过 ${SERVICE_TRIAL_FOLLOW_UP_SUMMARY_MAX_LENGTH} 个字符`,
      ),
    result: z
      .string()
      .trim()
      .min(1, '跟进结果不能为空')
      .max(
        SERVICE_TRIAL_FOLLOW_UP_RESULT_MAX_LENGTH,
        `跟进结果不能超过 ${SERVICE_TRIAL_FOLLOW_UP_RESULT_MAX_LENGTH} 个字符`,
      ),
    next_follow_up_at: NextFollowUpAtSchema,
    idempotency_key: IdempotencyKeySchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.status === 'pending' && !input.next_follow_up_at) {
      context.addIssue({
        code: 'custom',
        path: ['next_follow_up_at'],
        message: '待跟进任务必须指定下次跟进时间',
      });
    }
  });

export const CancelServiceTrialFollowUpSchema = z
  .object({
    status: z.literal('canceled'),
    idempotency_key: IdempotencyKeySchema,
  })
  .strict();

export type ServiceTrialFollowUpListQuery =
  z.infer<typeof ServiceTrialFollowUpListQuerySchema>;
export type CreateServiceTrialFollowUpInput =
  z.infer<typeof CreateServiceTrialFollowUpSchema>;
export type CancelServiceTrialFollowUpInput =
  z.infer<typeof CancelServiceTrialFollowUpSchema>;
