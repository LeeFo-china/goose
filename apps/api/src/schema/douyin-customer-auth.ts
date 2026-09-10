import { z } from "zod";

const ChinaMobilePhoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确");

const SmsCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, "验证码格式不正确");

const SelectionTokenSchema = z
  .string()
  .trim()
  .min(43, "选择 token 过短")
  .max(128, "选择 token 过长")
  .regex(/^[A-Za-z0-9_-]+$/, "选择 token 格式不正确");

export const DouyinCustomerAuthSendCodeSchema = z
  .object({
    phone: ChinaMobilePhoneSchema,
  })
  .strict();

export const DouyinCustomerAuthVerifySchema = z
  .object({
    phone: ChinaMobilePhoneSchema,
    code: SmsCodeSchema,
  })
  .strict();

export const DouyinCustomerAuthAuthorizeSchema = z
  .object({
    douyin_phone_code: z.string().trim().min(1).max(512),
  })
  .strict();

export const DouyinCustomerAuthSelectSchema = z
  .object({
    selection_token: SelectionTokenSchema,
    candidate_id: z.uuid("无效的候选身份 ID"),
  })
  .strict();

export type DouyinCustomerAuthSendCodeInput = z.infer<
  typeof DouyinCustomerAuthSendCodeSchema
>;
export type DouyinCustomerAuthVerifyInput = z.infer<
  typeof DouyinCustomerAuthVerifySchema
>;
export type DouyinCustomerAuthAuthorizeInput = z.infer<
  typeof DouyinCustomerAuthAuthorizeSchema
>;
export type DouyinCustomerAuthSelectInput = z.infer<
  typeof DouyinCustomerAuthSelectSchema
>;
