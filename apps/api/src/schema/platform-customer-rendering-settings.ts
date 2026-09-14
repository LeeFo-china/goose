import { z } from 'zod';

export const CustomerRenderingSettingsTenantParamsSchema = z.strictObject({ tenantId: z.uuid() });
export const CustomerRenderingSettingsEmptyQuerySchema = z.strictObject({});
export const CustomerRenderingSettingsUpdateSchema = z.strictObject({
  enabled: z.boolean(),
  daily_task_limit: z.number().int().min(1).max(10000),
  daily_budget_fen: z.number().int().min(1).max(100000000),
  per_job_reserve_fen: z.number().int().min(1).max(100000000),
  expected_version: z.number().int().min(0).max(2147483646),
  reason: z.string().trim().min(3).max(240),
}).refine((value) => value.per_job_reserve_fen <= value.daily_budget_fen, {
  path: ['per_job_reserve_fen'], message: '单任务预占不能超过日预算',
});

export type CustomerRenderingSettingsUpdate = z.infer<typeof CustomerRenderingSettingsUpdateSchema>;
