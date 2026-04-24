import { z } from "zod";

function nullableOptionalTrimmedString(max: number, message: string) {
  return z.preprocess((value) => {
    if (value == null) {
      return value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    return value;
  }, z.string().trim().max(max, message).nullable().optional());
}

export const AuthMeProfileUpdateSchema = z.object({
  nickname: nullableOptionalTrimmedString(50, "昵称不能超过 50 个字符"),
  avatar_path: nullableOptionalTrimmedString(500, "头像路径不能超过 500 个字符"),
}).refine(
  (value) => value.nickname !== undefined || value.avatar_path !== undefined,
  {
    message: "至少提交一个资料字段",
  },
);

export type AuthMeProfileUpdateInput = z.infer<typeof AuthMeProfileUpdateSchema>;
