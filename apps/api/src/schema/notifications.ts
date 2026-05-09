import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const NotificationStatusSchema = z.enum(["unread", "read"]);

export const NotificationListQuerySchema = PaginationQuerySchema.extend({
  status: NotificationStatusSchema.optional(),
});

export const NotificationIdParamsSchema = z.object({
  id: z.uuid("无效的通知 ID"),
});

export const NotificationMarkReadBodySchema = z.object({
  ids: z.array(z.uuid("无效的通知 ID"))
    .min(1, "至少选择一条通知")
    .max(100, "单次最多处理 100 条通知")
    .optional(),
});

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
export type NotificationMarkReadBody = z.infer<typeof NotificationMarkReadBodySchema>;
