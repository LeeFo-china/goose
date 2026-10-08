import { z } from 'zod';
export const TenantAdminPhoneParamsSchema = z.object({
  id: z.uuid('无效的租户 ID'),
  employeeId: z.uuid('无效的员工 ID'),
});
export const SendTenantAdminPhoneCodeSchema = z.object({
  new_phone: z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  expected_version: z.number().int('版本必须为整数').min(1, '版本无效'),
  idempotency_key: z.uuid('无效的请求标识'),
}).strict();
export const ConfirmTenantAdminPhoneSchema = SendTenantAdminPhoneCodeSchema.extend({
  challenge_id: z.uuid('无效的验证码请求'),
  code: z.string().trim().regex(/^\d{6}$/, '请输入六位验证码'),
  reason: z.string().trim().min(1, '请填写变更原因').max(500, '原因最多 500 字'),
  same_person_confirmed: z.literal(true, { message: '请确认管理员本人未变更' }),
}).strict();
export type SendTenantAdminPhoneInput = z.infer<typeof SendTenantAdminPhoneCodeSchema>;
export type ConfirmTenantAdminPhoneInput = z.infer<typeof ConfirmTenantAdminPhoneSchema>;
export type TenantAdminPhoneTarget = { tenantId: string; employeeId: string };
export type TenantAdminPhoneActor = { employeeId: string; authUserId: string; adminAuthVersion: number };
