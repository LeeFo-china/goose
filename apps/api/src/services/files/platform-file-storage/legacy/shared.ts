import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import type { PlatformFileProvider } from "@/repositories/platform-file-objects";
import type { PlatformFileVisibility } from "@/repositories/platform-file-objects";
import { systemSettingsService } from "@/services/system-settings";
import { SupabaseDB } from "@/utils/supabase";
import {
  resolveStoredFileUrl,
  setPlatformCosAccessConfigCache,
  setPlatformCosPublicBaseUrlCache,
} from "@/services/files/file-url-resolver";
import { logUploadTiming } from "@/utils/upload-timing-logger";

export const LEGACY_PROJECT_LOGS_BUCKET = "project-logs";
export const DEFAULT_COS_REGION = "ap-guangzhou";
export const DEFAULT_COS_SIGNED_URL_TTL_SECONDS = 900;
export const STORAGE_PROVIDER_CACHE_TTL_MS = 60_000;
export const COS_CONFIG_CACHE_TTL_MS = 60_000;
export const PLATFORM_FILE_STORAGE_TIMING_PREFIX = "[PLATFORM_FILE_STORAGE_TIMING]";

export type PlatformUploadScene =
  | "project_log"
  | "project_log_comment"
  | "customer_follow_up_comment"
  | "customer_service"
  | "expense_request"
  | "referral_payment"
  | "employee_avatar"
  | "customer_avatar"
  | "customer_douyin_screenshot"
  | "h5_marketing_page"
  | "project_acceptance"
  | "project_payment"
  | "wechat_pay_applyment"
  | "picture_library"
  | "picture_comment"
  | "tenant_onboarding_license"
  | "supplier_business_license"
  | "brand_logo";

export type UploadImageInput = {
  buffer: Buffer;
  filename?: string;
  mimetype: string;
  scene: PlatformUploadScene;
  projectId?: string;
  tenantId?: string | null;
  authUserId?: string | null;
  employeeId?: string | null;
  customerId?: string | null;
};

export type DirectUploadInput = Omit<UploadImageInput, "buffer"> & {
  sizeBytes: number;
  visibility?: PlatformFileVisibility;
  visitorId?: string | null;
};

export type CompleteDirectUploadInput = DirectUploadInput & {
  objectKey: string;
  etag?: string | null;
  uploadIntent?: string | null;
};

export type RegisterExistingCosObjectInput = Omit<DirectUploadInput, "mimetype" | "sizeBytes"> & {
  objectKey: string;
  mimetype?: string;
  sizeBytes?: number | null;
  ownerType?: string;
  ownerId?: string | null;
  etag?: string | null;
  uploadIntent?: string | null;
  verifyHead?: boolean;
  failIfMissing?: boolean;
  metadata?: Record<string, unknown>;
};

export type StorageUploadResult = {
  provider: PlatformFileProvider;
  bucket: string;
  region: string | null;
  objectKey: string;
  publicUrl: string;
  accessUrl: string;
  legacyPath?: string | null;
  metadata?: Record<string, unknown>;
};

export type PlatformUploadResponse = {
  url: string;
  path: string;
  file_id?: string;
  provider?: string;
  bucket?: string;
  region?: string | null;
  object_key?: string;
  storage_path?: string;
  public_url?: string;
};

export type PrivatePlatformUploadResponse = {
  file_id: string;
  status: string;
};

export type CosStorageConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicBaseUrl: string;
  signedUrlTtl: number;
  policyText: string;
  uploadUseAccelerate: boolean;
};

export function normalizeProvider(value: string | null | undefined): PlatformFileProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "tencent_cos" || normalized === "supabase_storage") {
    return normalized;
  }

  if (
    process.env.PLATFORM_COS_BUCKET &&
    process.env.TENCENT_COS_SECRET_ID &&
    process.env.TENCENT_COS_SECRET_KEY
  ) {
    return "tencent_cos";
  }

  return "supabase_storage";
}

export function trimSlashes(value: string) {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function joinPublicUrl(baseUrl: string, objectKey: string) {
  const encodedKey = trimSlashes(objectKey)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${baseUrl.replace(/\/+$/, "")}/${encodedKey}`;
}

export function getFileExtension(input: Pick<UploadImageInput, "filename" | "mimetype">) {
  const filenameExtension = extname(input.filename || "").toLowerCase();
  if (filenameExtension) {
    return filenameExtension;
  }

  const mimeToExtension: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
  };

  return mimeToExtension[input.mimetype] || ".jpg";
}

export function normalizeEtag(value: string | null | undefined) {
  return value?.trim().replace(/^"+|"+$/g, "") || null;
}

export function logPlatformFileStorageTiming(
  stage: string,
  startedAt: number,
  extra: Record<string, unknown> = {},
) {
  logUploadTiming(PLATFORM_FILE_STORAGE_TIMING_PREFIX, stage, startedAt, extra);
}

export function now() {
  return Date.now();
}

export function getMimeTypeFromObjectKey(objectKey: string) {
  const normalized = objectKey.split("?")[0]?.toLowerCase() || "";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".heic")) return "image/heic";
  if (normalized.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

export function getFilenameFromObjectKey(objectKey: string) {
  return trimSlashes(objectKey).split("/").filter(Boolean).pop() || null;
}

export {
  COS,
  Errors,
  ErrorCodes,
  SupabaseDB,
  platformFileObjectRepository,
  resolveStoredFileUrl,
  setPlatformCosAccessConfigCache,
  setPlatformCosPublicBaseUrlCache,
  systemSettingsService,
};
export type { PlatformFileProvider, PlatformFileVisibility };
