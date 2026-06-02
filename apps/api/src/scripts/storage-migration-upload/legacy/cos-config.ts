import { systemSettingsService } from "@/services/system-settings";
import type { CosConfig } from "./types";

const DEFAULT_COS_REGION = "ap-guangzhou";

export async function getCosConfig(): Promise<CosConfig> {
  const [secretId, secretKey, bucket, region, publicBaseUrl] = await Promise.all([
    systemSettingsService.getSecretString("TENCENT_COS_SECRET_ID"),
    systemSettingsService.getSecretString("TENCENT_COS_SECRET_KEY"),
    systemSettingsService.getString("PLATFORM_COS_BUCKET"),
    systemSettingsService.getString("PLATFORM_COS_REGION", DEFAULT_COS_REGION),
    systemSettingsService.getString("PLATFORM_COS_PUBLIC_BASE_URL"),
  ]);

  if (!secretId || !secretKey || !bucket || !region || !publicBaseUrl) {
    throw new Error(
      "缺少 COS 配置：TENCENT_COS_SECRET_ID/TENCENT_COS_SECRET_KEY/PLATFORM_COS_BUCKET/PLATFORM_COS_REGION/PLATFORM_COS_PUBLIC_BASE_URL",
    );
  }

  return {
    secretId,
    secretKey,
    bucket,
    region,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}
