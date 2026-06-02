import { SupabaseDB } from "./legacy/shared";
import { getStorageProvider, getCosConfig, getCosClient, shouldVerifyDirectUploadHead, setCosAccessCache } from "./legacy/config";
import { buildLegacyObjectPath, buildCosObjectKey, buildCosPublicUrl, toUploadResponse } from "./legacy/paths";
import { uploadToTencentCos, uploadToSupabase, uploadImage } from "./legacy/uploads";
import { createDirectUpload, completeDirectUpload, registerExistingCosObject } from "./legacy/direct-upload";
import type { CosStorageConfig, PlatformFileProvider } from "./legacy/shared";

export type { PlatformUploadScene } from "./legacy/shared";

class PlatformFileStorageService {
  private cosClient: unknown | null = null;
  private cosClientKey: string | null = null;
  private storageProviderCache: {
    expiresAt: number;
    value: PlatformFileProvider;
  } | null = null;
  private cosConfigCache: {
    expiresAt: number;
    value: CosStorageConfig;
  } | null = null;

  private getStorageProvider = getStorageProvider;
  private getCosConfig = getCosConfig;
  private getCosClient = getCosClient;
  private shouldVerifyDirectUploadHead = shouldVerifyDirectUploadHead;
  private buildLegacyObjectPath = buildLegacyObjectPath;
  private buildCosObjectKey = buildCosObjectKey;
  private uploadToTencentCos = uploadToTencentCos;
  private uploadToSupabase = uploadToSupabase;
  private buildCosPublicUrl = buildCosPublicUrl;
  private setCosAccessCache = setCosAccessCache;
  private toUploadResponse = toUploadResponse;
  uploadImage = uploadImage;
  createDirectUpload = createDirectUpload;
  completeDirectUpload = completeDirectUpload;
  registerExistingCosObject = registerExistingCosObject;
}

export const platformFileStorageService = new PlatformFileStorageService();
