import { PaginationQuerySchema } from "@/schema/request";
import { PlatformPartnerPhoneSchema } from "@/schema/platform-partner-phone";
import { z } from "zod";

const OptionalTextSchema = (max: number, message: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    },
    z.string().trim().max(max, message).optional(),
  );

export const PlatformPartnerMemberRebindStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const PlatformPartnerMemberRebindIdParamSchema = z.object({
  id: z.uuid("无效的合伙人成员换绑申请 ID"),
});

export const PlatformPartnerMemberRebindSendCodeSchema = z.object({
  phone: PlatformPartnerPhoneSchema,
}).strict();

export const CreatePlatformPartnerMemberRebindRequestSchema = z.object({
  phone: PlatformPartnerPhoneSchema,
  sms_code: z.string().trim().length(6, "验证码必须为 6 位"),
  applicant_name: OptionalTextSchema(80, "申请人姓名不能超过 80 个字符"),
  reason: OptionalTextSchema(500, "换绑原因不能超过 500 个字符"),
}).strict();

export const PlatformPartnerMemberRebindListQuerySchema =
  PaginationQuerySchema.extend({
    status: PlatformPartnerMemberRebindStatusSchema.optional(),
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
    partner_id: z.uuid("无效的合伙人 ID").optional(),
  });

export const ReviewPlatformPartnerMemberRebindRequestSchema = z.object({
  comment: OptionalTextSchema(500, "审核备注不能超过 500 个字符"),
}).strict();

export type CreatePlatformPartnerMemberRebindRequestInput =
  z.infer<typeof CreatePlatformPartnerMemberRebindRequestSchema>;
export type PlatformPartnerMemberRebindListQuery =
  z.infer<typeof PlatformPartnerMemberRebindListQuerySchema>;
export type PlatformPartnerMemberRebindSendCodeInput =
  z.infer<typeof PlatformPartnerMemberRebindSendCodeSchema>;
export type PlatformPartnerMemberRebindStatus =
  z.infer<typeof PlatformPartnerMemberRebindStatusSchema>;
export type ReviewPlatformPartnerMemberRebindRequestInput =
  z.infer<typeof ReviewPlatformPartnerMemberRebindRequestSchema>;
