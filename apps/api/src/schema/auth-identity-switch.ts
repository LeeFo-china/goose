import { z } from "zod";

export const AuthIdentityModeSchema = z.enum([
  "platform_visitor",
  "platform_partner",
  "tenant_employee",
  "customer",
]);

export const SwitchIdentitySchema = z.object({
  target_mode: AuthIdentityModeSchema,
  partner_member_id: z.uuid("无效的 ID 格式").optional(),
  tenant_id: z.uuid("无效的 ID 格式").optional(),
  employee_id: z.uuid("无效的 ID 格式").optional(),
  customer_id: z.uuid("无效的 ID 格式").optional(),
});

export type AuthIdentityMode = z.infer<typeof AuthIdentityModeSchema>;
export type SwitchIdentityInput = z.infer<typeof SwitchIdentitySchema>;
