export const AI_SECRET_SETTING_KEYS = [
  "AI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "ARK_API_KEY",
] as const;

export function isAiSecretSettingKey(key: string): boolean {
  return AI_SECRET_SETTING_KEYS.some((item) => item === key);
}

export function shouldPreserveEmptyAiSecret(
  setting: { key: string; is_secret: boolean }, value: string,
): boolean {
  return setting.is_secret && isAiSecretSettingKey(setting.key) && !value.trim();
}
