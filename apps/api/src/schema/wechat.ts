import { z } from "zod";
import {
  AUTH_TARGET_ROLE_VALUES,
  CUSTOMER_ORIGIN_VALUES,
  SMS_SCENE_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";

export const WechatSchema = z.object({});

export const SendCodeSchema = z.object({
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  scene: z.enum(SMS_SCENE_VALUES, {
    message: "无效的验证码场景",
  }),
});

export const VerifyRoleSchema = z.object({
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  code: z.string()
    .trim()
    .regex(/^\d{4,6}$/, "验证码格式不正确")
    .optional()
    .or(z.literal("")),
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

export const WechatRebindRequestSchema = z.object({
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  code: z.string().trim().regex(/^\d{4,6}$/, "验证码格式不正确").optional().or(z.literal("")),
  target_role: z.enum(AUTH_TARGET_ROLE_VALUES, {
    message: "无效的目标角色",
  }),
  tenant_id: z.uuid("无效的租户 ID"),
  customer_id: z.uuid("无效的客户 ID").optional(),
  employee_id: z.uuid("无效的员工 ID").optional(),
  applicant_name: z.string().trim().max(50, "申请人姓名不能超过 50 个字符").nullable().optional(),
  project_hint: z.string().trim().max(120, "项目提示不能超过 120 个字符").nullable().optional(),
  community_hint: z.string().trim().max(120, "小区提示不能超过 120 个字符").nullable().optional(),
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.target_role === "customer" && !value.customer_id) {
    ctx.addIssue({
      code: "custom",
      path: ["customer_id"],
      message: "客户换绑必须选择客户档案",
    });
  }

  if (value.target_role === "employee" && !value.employee_id) {
    ctx.addIssue({
      code: "custom",
      path: ["employee_id"],
      message: "员工换绑必须选择员工档案",
    });
  }
});

export const WechatRebindRequestListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["pending", "approved", "rejected", "cancelled"], {
    message: "无效的申请状态",
  }).optional(),
});

export const WechatRebindRequestParamsSchema = z.object({
  id: z.uuid("无效的换绑申请 ID"),
});

export const ReviewWechatRebindRequestSchema = z.object({
  comment: z.string().trim().max(500, "审核说明不能超过 500 个字符").nullable().optional(),
});

// 导出类型供 TypeScript 使用

export const UpdateWechatSchema = WechatSchema.partial();

export type WechatSchemaType = z.infer<typeof WechatSchema>;
export const CreateWechatSchema = z.object({});
export type UpdateWechatSchemaType = z.infer<typeof UpdateWechatSchema>;
export type SendCodeInput = z.infer<typeof SendCodeSchema>;
export type VerifyRoleInput = z.infer<typeof VerifyRoleSchema>;
export type WechatRebindRequestInput = z.infer<typeof WechatRebindRequestSchema>;
export type WechatRebindRequestListQuery = z.infer<typeof WechatRebindRequestListQuerySchema>;
export type ReviewWechatRebindRequestInput = z.infer<typeof ReviewWechatRebindRequestSchema>;
