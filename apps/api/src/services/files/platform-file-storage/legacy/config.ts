import { COS, COS_CONFIG_CACHE_TTL_MS, DEFAULT_COS_REGION, DEFAULT_COS_SIGNED_URL_TTL_SECONDS, ErrorCodes, Errors, STORAGE_PROVIDER_CACHE_TTL_MS, normalizeProvider, setPlatformCosAccessConfigCache, setPlatformCosPublicBaseUrlCache, systemSettingsService } from "./shared";
import type { CosStorageConfig } from "./shared";

export async function getStorageProvider(this: any, ) {
  if (this.storageProviderCache && this.storageProviderCache.expiresAt > Date.now()) {
    return this.storageProviderCache.value;
  }

  const configured = await systemSettingsService.getString(
    "PLATFORM_STORAGE_PROVIDER",
    "",
  );
  const provider = normalizeProvider(configured);
  this.storageProviderCache = {
    expiresAt: Date.now() + STORAGE_PROVIDER_CACHE_TTL_MS,
    value: provider,
  };

  return provider;
}

export async function getCosConfig(this: any, ): Promise<CosStorageConfig> {
  if (this.cosConfigCache && this.cosConfigCache.expiresAt > Date.now()) {
    return this.cosConfigCache.value;
  }

  const [
    secretId,
    secretKey,
    bucket,
    region,
    publicBaseUrl,
    signedUrlTtl,
    policyText,
    uploadUseAccelerate,
  ] =
    await Promise.all([
      systemSettingsService.getSecretString("TENCENT_COS_SECRET_ID"),
      systemSettingsService.getSecretString("TENCENT_COS_SECRET_KEY"),
      systemSettingsService.getString("PLATFORM_COS_BUCKET"),
      systemSettingsService.getString("PLATFORM_COS_REGION", DEFAULT_COS_REGION),
      systemSettingsService.getString("PLATFORM_COS_PUBLIC_BASE_URL"),
      systemSettingsService.getNumber(
        "PLATFORM_COS_SIGNED_URL_TTL_SECONDS",
        DEFAULT_COS_SIGNED_URL_TTL_SECONDS,
      ),
      systemSettingsService.getString("PLATFORM_FILE_ACCESS_POLICY", ""),
      systemSettingsService.getBoolean("PLATFORM_COS_UPLOAD_USE_ACCELERATE", false),
    ]);

  if (!secretId || !secretKey || !bucket || !region) {
    throw Errors.business(
      503,
      "腾讯云 COS 暂未配置",
      ErrorCodes.FILE_STORAGE_CONFIG_MISSING,
      {
        required: [
          "TENCENT_COS_SECRET_ID",
          "TENCENT_COS_SECRET_KEY",
          "PLATFORM_COS_BUCKET",
          "PLATFORM_COS_REGION",
        ],
      },
    );
  }

  const config = {
    secretId,
    secretKey,
    bucket,
    region,
    publicBaseUrl: publicBaseUrl.trim(),
    signedUrlTtl,
    policyText,
    uploadUseAccelerate,
  };

  this.cosConfigCache = {
    expiresAt: Date.now() + COS_CONFIG_CACHE_TTL_MS,
    value: config,
  };

  return config;
}

export function getCosClient(this: any, config: {
  secretId: string;
  secretKey: string;
  uploadUseAccelerate?: boolean;
}) {
  const clientKey = `${config.secretId}:${config.secretKey}:${
    config.uploadUseAccelerate ? "accelerate" : "standard"
  }`;
  if (!this.cosClient || this.cosClientKey !== clientKey) {
    this.cosClient = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      UseAccelerate: Boolean(config.uploadUseAccelerate),
    });
    this.cosClientKey = clientKey;
  }

  return this.cosClient;
}

export function shouldVerifyDirectUploadHead(this: any, ) {
  return process.env.PLATFORM_COS_DIRECT_UPLOAD_VERIFY_HEAD === "true";
}

export function setCosAccessCache(this: any, config: {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicBaseUrl: string;
  signedUrlTtl: number;
  policyText: string;
}) {
  setPlatformCosPublicBaseUrlCache(config.publicBaseUrl);
  setPlatformCosAccessConfigCache({
    secretId: config.secretId,
    secretKey: config.secretKey,
    bucket: config.bucket,
    region: config.region,
    publicBaseUrl: config.publicBaseUrl,
    signedUrlTtlSeconds: config.signedUrlTtl,
    policyText: config.policyText,
  });
}
