import { z } from "zod";
import {
  AUTH_TARGET_ROLE_VALUES,
  CUSTOMER_ORIGIN_VALUES,
  SMS_SCENE_VALUES,
} from "@gooes/domain";

export const WechatSchema = z.object({});

export const SendCodeSchema = z.object({
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  scene: z.enum(SMS_SCENE_VALUES, {
    message: "无效的验证码场景",
  }),
});

export const VerifyRoleSchema = z.object({
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  code: z.string().trim().regex(/^\d{4,6}$/, "验证码格式不正确"),
  target_role: z.enum(AUTH_TARGET_ROLE_VALUES, {
    message: "无效的目标角色",
  }),
  share_token: z.string()
    .trim()
    .min(8, "分享 token 过短")
    .max(80, "分享 token 过长")
    .regex(/^[A-Za-z0-9_-]+$/, "分享 token 格式不正确")
    .optional(),
  create_customer_if_missing: z.boolean().optional().default(false),
  customer_origin: z.enum(CUSTOMER_ORIGIN_VALUES, {
    message: "无效的客户创建渠道",
  }).optional(),
});

// 导出类型供 TypeScript 使用

export const UpdateWechatSchema = WechatSchema.partial();

export type WechatSchemaType = z.infer<typeof WechatSchema>;
export const CreateWechatSchema = z.object({});
export type UpdateWechatSchemaType = z.infer<typeof UpdateWechatSchema>;
export type SendCodeInput = z.infer<typeof SendCodeSchema>;
export type VerifyRoleInput = z.infer<typeof VerifyRoleSchema>;
