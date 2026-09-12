import { z } from "zod";

export const AI_SECRET_SETTING_KEYS = [
  "AI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "ARK_API_KEY",
] as const;
export type AiSecretSettingKey = typeof AI_SECRET_SETTING_KEYS[number];
export const AiSecretSettingKeySchema = z.enum(AI_SECRET_SETTING_KEYS, {
  message: "请选择已登记的 AI 密钥配置",
});
export const AiSecretSettingParamsSchema = z.strictObject({ key: AiSecretSettingKeySchema });
export const ReplaceAiSecretSettingSchema = z.strictObject({
  value: z.string().trim().min(1, "新密钥不能为空").max(8192, "新密钥过长"),
});
export function isAiSecretSettingKey(value: unknown): value is AiSecretSettingKey {
  return typeof value === "string" && AI_SECRET_SETTING_KEYS.some(key => key === value);
}
