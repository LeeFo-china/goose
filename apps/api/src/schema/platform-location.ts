import { z } from "zod";

const optionalText = (max: number, message: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    },
    z.string().trim().max(max, message).optional(),
  );

export const PlatformAddressSuggestionQuerySchema = z.object({
  keyword: z.string().trim().min(2, "请输入至少 2 个字符").max(80, "关键词不能超过 80 个字符"),
  region: optionalText(40, "搜索区域不能超过 40 个字符"),
  pageSize: z.coerce.number("每页数量必须是数字").int("每页数量必须是整数").min(1).max(10).default(10),
});

export type PlatformAddressSuggestionQuery = z.infer<typeof PlatformAddressSuggestionQuerySchema>;
