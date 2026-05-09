import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const CustomerSourceParamsSchema = z.object({
  id: z.uuid("无效的客户 ID"),
});

export const CustomerSourceListQuerySchema = PaginationQuerySchema;

export type CustomerSourceListQuery = z.infer<typeof CustomerSourceListQuerySchema>;
