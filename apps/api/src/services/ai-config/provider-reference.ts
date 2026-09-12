import { isAiSecretSettingKey } from "@/schema/ai-secret-settings";

// 输出边界统一处理供应商、模型、主备路由等嵌套 DTO；不改写持久化的历史引用。
export function redactAiProviderReferences<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => redactAiProviderReferences(item)) as T;
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = key === "api_key_setting_key"
      ? isAiSecretSettingKey(item) ? item : null
      : redactAiProviderReferences(item);
  }
  if (Object.hasOwn(value, "api_key_setting_key")) {
    const isInvalid = !isAiSecretSettingKey(output.api_key_setting_key)
      || (output.provider_type === "openrouter" && output.api_key_setting_key !== "OPENROUTER_API_KEY");
    output.api_key_setting_invalid = isInvalid;
    if (isInvalid) output.api_key_setting_key = null;
  }
  return output as T;
}
