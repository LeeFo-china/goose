import { z } from "zod";
import {
  SMS_SCENE_VALUES,
  SMS_VERIFICATION_STATUS_VALUES,
} from "@gooes/domain";

export const SmsVerificationCodeSchema = z.object({
  id: z.string().uuid("无效的验证码 ID").optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  scene: z.enum(SMS_SCENE_VALUES, {
    message: "无效的验证码场景",
  }),
  code: z.string().trim().regex(/^\d{4,6}$/, "验证码格式不正确"),
  status: z.enum(SMS_VERIFICATION_STATUS_VALUES, {
    message: "无效的验证码状态",
  }).default("pending"),
  expired_at: z.iso.datetime("无效的过期时间").or(
    z.string().datetime("无效的过期时间"),
  ),
  verified_at: z.iso.datetime("无效的核销时间").or(
    z.string().datetime("无效的核销时间"),
  ).nullable().optional(),
  created_at: z.iso.datetime("无效的创建时间").or(
    z.string().datetime("无效的创建时间"),
  ).optional(),
  request_ip: z.string().trim().nullable().optional(),
});

export const CreateSmsVerificationCodeSchema = SmsVerificationCodeSchema.omit({
  id: true,
  verified_at: true,
  created_at: true,
});

export const UpdateSmsVerificationCodeSchema = CreateSmsVerificationCodeSchema.partial();

export type SmsVerificationCodeType = z.infer<typeof SmsVerificationCodeSchema>;
export type CreateSmsVerificationCodeInput = z.infer<typeof CreateSmsVerificationCodeSchema>;
export type UpdateSmsVerificationCodeInput = z.infer<typeof UpdateSmsVerificationCodeSchema>;
