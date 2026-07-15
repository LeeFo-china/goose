import { z } from "zod";

const ChinaMobilePhoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确");

const SmsCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, "验证码格式不正确");

const ShareTokenSchema = z
  .string()
  .trim()
  .min(8, "分享 token 过短")
  .max(80, "分享 token 过长")
  .regex(/^[A-Za-z0-9_-]+$/, "分享 token 格式不正确");

const SelectionTokenSchema = z
  .string()
  .trim()
  .min(43, "选择 token 过短")
  .max(128, "选择 token 过长")
  .regex(/^[A-Za-z0-9_-]+$/, "选择 token 格式不正确");

export const PhoneIdentityLoginSendCodeSchema = z
  .object({
    phone: ChinaMobilePhoneSchema,
  })
  .strict();

export const PhoneIdentityLoginVerifySchema = z
  .object({
    phone: ChinaMobilePhoneSchema,
    code: SmsCodeSchema,
    share_token: ShareTokenSchema.optional(),
  })
  .strict();

export const PhoneIdentityLoginSelectSchema = z
  .object({
    selection_token: SelectionTokenSchema,
    candidate_id: z.uuid("无效的候选身份 ID"),
  })
  .strict();

export type PhoneIdentityLoginSendCodeInput = z.infer<
  typeof PhoneIdentityLoginSendCodeSchema
>;

export type PhoneIdentityLoginVerifyInput = z.infer<
  typeof PhoneIdentityLoginVerifySchema
>;

export type PhoneIdentityLoginSelectInput = z.infer<
  typeof PhoneIdentityLoginSelectSchema
>;
