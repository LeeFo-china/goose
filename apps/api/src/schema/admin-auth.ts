import { z } from "zod";

export const AdminAuthPhoneSchema = z.object({
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
});

export const AdminAuthLoginSchema = AdminAuthPhoneSchema.extend({
  code: z.string().trim().regex(/^\d{4,6}$/, "验证码格式不正确"),
});

export type AdminAuthPhoneInput = z.infer<typeof AdminAuthPhoneSchema>;
export type AdminAuthLoginInput = z.infer<typeof AdminAuthLoginSchema>;
