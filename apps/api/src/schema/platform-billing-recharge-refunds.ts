import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const PlatformRechargeRefundRequestParamSchema = z.object({
  id: z.uuid("无效的退款申请 ID"),
});

export const PlatformRechargeRefundRequestStatusSchema = z.enum([
  "pending_review",
  "approved",
  "rejected",
  "refunding",
  "refunded",
  "failed",
]);

export const PlatformRechargeRefundRequestQuerySchema =
  PaginationQuerySchema.extend({
    status: PlatformRechargeRefundRequestStatusSchema.optional(),
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
  });

export const PlatformRechargeRefundReviewSchema = z.object({
  review_note: z.string().trim().min(1, "审核备注不能为空")
    .max(500, "审核备注不能超过 500 个字符"),
}).strict();

export type PlatformRechargeRefundRequestQuery =
  z.infer<typeof PlatformRechargeRefundRequestQuerySchema>;
export type PlatformRechargeRefundReviewInput =
  z.infer<typeof PlatformRechargeRefundReviewSchema>;
export type PlatformRechargeRefundRequestStatus =
  z.infer<typeof PlatformRechargeRefundRequestStatusSchema>;
