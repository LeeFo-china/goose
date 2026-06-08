import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const VisitorProjectParamsSchema = z.object({
  id: z.uuid("无效的项目 ID"),
});

export const VisitorProjectListQuerySchema = PaginationQuerySchema.extend({
  scope: z.enum(["following"], {
    message: "无效的项目列表范围",
  }).optional().default("following"),
});

export type VisitorProjectListQuery = z.infer<typeof VisitorProjectListQuerySchema>;
