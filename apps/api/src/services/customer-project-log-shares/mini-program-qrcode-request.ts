export type MiniProgramEnvVersion = "release" | "trial" | "develop";

interface MiniProgramQrcodeSettings {
  getString(key: string, fallback?: string): Promise<string>;
}

export interface MiniProgramQrcodeRequestBody {
  scene: string;
  page: string;
  check_path: boolean;
  env_version: MiniProgramEnvVersion;
}

export async function buildMiniProgramQrcodeRequest(input: {
  scene: string;
  page: string;
  settings: MiniProgramQrcodeSettings;
  normalizeEnvVersion(value: string): MiniProgramEnvVersion;
}): Promise<MiniProgramQrcodeRequestBody> {
  const configuredEnvVersion = await input.settings.getString(
    "WECHAT_MINIPROGRAM_ENV_VERSION",
    "release",
  );

  return {
    scene: input.scene,
    page: input.page,
    check_path: false,
    env_version: input.normalizeEnvVersion(configuredEnvVersion),
  };
}
