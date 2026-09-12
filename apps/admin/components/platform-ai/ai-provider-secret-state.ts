import { z } from "zod";
import { requestBackendJson } from "@/lib/backend-client";
import { AI_SECRET_SETTING_KEYS } from "@/components/settings/ai-secret-input";

const secretSettingSchema = z.strictObject({
  key: z.enum(AI_SECRET_SETTING_KEYS), name: z.string().min(1).max(120),
  source: z.enum(["database", "env", "empty"]),
  status: z.enum(["configured", "empty", "invalid"]),
});
const responseSchema = z.strictObject({
  list: z.array(secretSettingSchema).max(4).refine((rows) => new Set(rows.map((row) => row.key)).size === rows.length),
  can_manage: z.boolean(),
});
export type AiSecretSettings = z.infer<typeof responseSchema>;
export type AiSecretSetting = z.infer<typeof secretSettingSchema>;

export function parseSecretSettings(value: unknown): AiSecretSettings {
  return responseSchema.parse(value);
}

export async function loadAiSecretSettings(): Promise<AiSecretSettings> {
  return parseSecretSettings(await requestBackendJson("/platform/ai-config/secret-settings", { cache: "no-store" }));
}

export async function replaceAiSecret(
  key: string, input: string,
  request: (path: string, init?: RequestInit) => Promise<unknown> = requestBackendJson,
): Promise<boolean> {
  const value = input.trim();
  if (!value) return false;
  const target = z.enum(AI_SECRET_SETTING_KEYS).parse(key);
  if (value.length > 8192) throw new Error("密钥长度不能超过 8192 个字符");
  const result = await request(`/platform/ai-config/secret-settings/${encodeURIComponent(target)}`, {
    method: "PATCH", cache: "no-store", body: JSON.stringify({ value }),
  });
  const ack = z.strictObject({ key: z.literal(target), saved: z.literal(true) }).safeParse(result);
  if (!ack.success) throw new Error("保存结果未确认，请刷新状态后检查");
  return true;
}
