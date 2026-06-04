import { z } from "zod";

export const AdministrativeAreaLevelSchema = z.enum(["province", "city", "district"]);

export const AdministrativeAreaListQuerySchema = z.object({
  level: AdministrativeAreaLevelSchema.optional(),
  parent_adcode: z.string().trim().max(20, "上级行政区划代码过长").optional(),
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
  tree: z.coerce.boolean().optional(),
});

export type AdministrativeAreaLevel = z.infer<typeof AdministrativeAreaLevelSchema>;
export type AdministrativeAreaListQuery = z.infer<typeof AdministrativeAreaListQuerySchema>;
