import { z } from "zod";

export const IdentityDiagnosticsQuerySchema = z.object({
  keyword: z.string().trim().min(1, "请输入手机号、openid 或 user_id").max(160, "关键词不能超过 160 个字符"),
});

export type IdentityDiagnosticsQuery = z.infer<typeof IdentityDiagnosticsQuerySchema>;
