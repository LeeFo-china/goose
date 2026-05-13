import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const UserAuthEventPlatformSchema = z.enum([
  "wechat_mini",
  "wechat_web",
  "ios",
  "android",
  "web",
  "apple",
]);

export const UserAuthEventListQuerySchema = PaginationQuerySchema.extend({
  event_type: z.string().trim().max(100, "事件类型不能超过 100 个字符").optional(),
  user_id: z.uuid("无效的用户 ID").optional(),
  operator_user_id: z.uuid("无效的操作人用户 ID").optional(),
  platform: UserAuthEventPlatformSchema.optional(),
  date_from: z.string().trim().datetime("开始时间格式不正确").optional(),
  date_to: z.string().trim().datetime("结束时间格式不正确").optional(),
});

export const UserAuthEventSummaryQuerySchema = z.object({
  date_from: z.string().trim().datetime("开始时间格式不正确").optional(),
  date_to: z.string().trim().datetime("结束时间格式不正确").optional(),
});

export type UserAuthEventPlatform = z.infer<typeof UserAuthEventPlatformSchema>;
export type UserAuthEventListQuery = z.infer<typeof UserAuthEventListQuerySchema>;
export type UserAuthEventSummaryQuery = z.infer<typeof UserAuthEventSummaryQuerySchema>;
