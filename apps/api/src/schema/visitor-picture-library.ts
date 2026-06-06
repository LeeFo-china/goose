import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const VisitorPictureAssetListQuerySchema = PaginationQuerySchema.extend({
  category_id: z.uuid("无效的分类 ID").optional(),
});

export const VisitorPictureAssetParamsSchema = z.object({
  id: z.uuid("无效的图片 ID"),
});

export type VisitorPictureAssetListQuery = z.infer<typeof VisitorPictureAssetListQuerySchema>;
