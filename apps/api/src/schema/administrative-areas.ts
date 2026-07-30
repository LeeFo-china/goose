import { z } from "zod";

export const AdministrativeAreaLevelSchema = z.enum(["province", "city", "district"]);

const AdministrativeAreaAdcodesSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const codes = value.split(",").map((code) => code.trim()).filter(Boolean);
    return codes.length > 0 ? codes : undefined;
  },
  z
    .array(z.string().trim().min(1).max(20, "行政区划代码过长"))
    .max(100, "单次最多查询 100 个行政区划")
    .transform((codes) => Array.from(new Set(codes)).sort())
    .optional(),
);

export const AdministrativeAreaListQuerySchema = z.object({
  level: AdministrativeAreaLevelSchema.optional(),
  parent_adcode: z.string().trim().max(20, "上级行政区划代码过长").optional(),
  adcodes: AdministrativeAreaAdcodesSchema,
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
  tree: z.coerce.boolean().optional(),
});

export type AdministrativeAreaLevel = z.infer<typeof AdministrativeAreaLevelSchema>;
export type AdministrativeAreaListQuery = z.infer<typeof AdministrativeAreaListQuerySchema>;
