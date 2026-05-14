import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import type { PlatformFileProvider } from "@/repositories/platform-file-objects";
import { systemSettingsService } from "@/services/system-settings";
import { SupabaseDB } from "@/utils/supabase";
import {
  resolveStoredFileUrl,
  setPlatformCosAccessConfigCache,
  setPlatformCosPublicBaseUrlCache,
} from "@/services/files/file-url-resolver";

const LEGACY_PROJECT_LOGS_BUCKET = "project-logs";
const DEFAULT_COS_REGION = "ap-guangzhou";
const DEFAULT_COS_SIGNED_URL_TTL_SECONDS = 900;

export type PlatformUploadScene =
  | "project_log"
  | "project_log_comment"
  | "customer_follow_up_comment"
  | "expense_request"
  | "referral_payment"
  | "employee_avatar"
  | "customer_avatar"
  | "customer_douyin_screenshot"
  | "h5_marketing_page"
  | "project_acceptance";

type UploadImageInput = {
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

type DirectUploadInput = Omit<UploadImageInput, "buffer"> & {
  sizeBytes: number;
};

type CompleteDirectUploadInput = DirectUploadInput & {
  objectKey: string;
  etag?: string | null;
};

type StorageUploadResult = {
  provider: PlatformFileProvider;
  bucket: string;
  region: string | null;
  objectKey: string;
  publicUrl: string;
  accessUrl: string;
  legacyPath?: string | null;
  metadata?: Record<string, unknown>;
};

type PlatformUploadResponse = {
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

function normalizeProvider(value: string | null | undefined): PlatformFileProvider {
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

function trimSlashes(value: string) {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function joinPublicUrl(baseUrl: string, objectKey: string) {
  const encodedKey = trimSlashes(objectKey)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${baseUrl.replace(/\/+$/, "")}/${encodedKey}`;
}

function getFileExtension(input: Pick<UploadImageInput, "filename" | "mimetype">) {
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

function normalizeEtag(value: string | null | undefined) {
  return value?.trim().replace(/^"+|"+$/g, "") || null;
}

class PlatformFileStorageService {
  private cosClient: COS | null = null;

  private async getStorageProvider() {
    const configured = await systemSettingsService.getString(
      "PLATFORM_STORAGE_PROVIDER",
      "",
    );
    return normalizeProvider(configured);
  }

  private async getCosConfig() {
    const [secretId, secretKey, bucket, region, publicBaseUrl, signedUrlTtl, policyText] =
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

    return {
      secretId,
      secretKey,
      bucket,
      region,
      publicBaseUrl: publicBaseUrl.trim(),
      signedUrlTtl,
      policyText,
    };
  }

  private getCosClient(config: { secretId: string; secretKey: string }) {
    if (!this.cosClient) {
      this.cosClient = new COS({
        SecretId: config.secretId,
        SecretKey: config.secretKey,
      });
    }

    return this.cosClient;
  }

  private buildLegacyObjectPath(input: {
    scene: PlatformUploadScene;
    projectId?: string;
    extension: string;
  }) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const prefixByScene: Record<PlatformUploadScene, string> = {
      project_log: input.projectId?.trim() || "unassigned",
      project_log_comment: "project-log-comment",
      customer_follow_up_comment: "customer-follow-up-comment",
      expense_request: "expense-request",
      referral_payment: "referral-payment",
      employee_avatar: "employee-avatar",
      customer_avatar: "customer-avatar",
      customer_douyin_screenshot: "customer-douyin-screenshots",
      h5_marketing_page: "h5-marketing-pages",
      project_acceptance: input.projectId?.trim()
        ? `${input.projectId.trim()}/acceptance`
        : "project-acceptance",
    };

    return `${prefixByScene[input.scene]}/${year}/${month}/${day}/${randomUUID()}${input.extension}`;
  }

  private buildCosObjectKey(input: Pick<
    UploadImageInput,
    "filename" | "mimetype" | "scene" | "projectId" | "tenantId"
  >) {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const extension = getFileExtension(input);
    const tenantPrefix = input.tenantId
      ? `tenants/${input.tenantId}`
      : "public";
    const scene = input.scene.replace(/_/g, "-");
    const projectSegment = input.projectId?.trim()
      ? `projects/${input.projectId.trim()}`
      : "unassigned";

    return `${tenantPrefix}/${scene}/${projectSegment}/${year}/${month}/${day}/${randomUUID()}${extension}`;
  }

  private async uploadToTencentCos(input: UploadImageInput): Promise<StorageUploadResult> {
    const config = await this.getCosConfig();
    const objectKey = this.buildCosObjectKey(input);
    const cos = this.getCosClient(config);

    try {
      await cos.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: objectKey,
        Body: input.buffer,
        ContentLength: input.buffer.length,
        ContentType: input.mimetype,
      });
    } catch (error) {
      throw Errors.business(
        502,
        "上传腾讯云 COS 失败",
        ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
        error,
      );
    }

    const publicUrl = config.publicBaseUrl
      ? joinPublicUrl(config.publicBaseUrl, objectKey)
      : cos.getObjectUrl({
        Bucket: config.bucket,
        Region: config.region,
        Key: objectKey,
        Sign: true,
        Expires: config.signedUrlTtl,
        Protocol: "https:",
      });
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
    const accessUrl = resolveStoredFileUrl(objectKey) || publicUrl;

    return {
      provider: "tencent_cos",
      bucket: config.bucket,
      region: config.region,
      objectKey,
      publicUrl,
      accessUrl,
      metadata: {
        signed_url: accessUrl !== publicUrl,
      },
    };
  }

  private async uploadToSupabase(input: UploadImageInput): Promise<StorageUploadResult> {
    const extension = getFileExtension(input);
    const objectKey = this.buildLegacyObjectPath({
      scene: input.scene,
      projectId: input.projectId,
      extension,
    });

    const { error } = await SupabaseDB.getAdminClient()
      .storage
      .from(LEGACY_PROJECT_LOGS_BUCKET)
      .upload(objectKey, input.buffer, {
        contentType: input.mimetype,
        upsert: false,
      });

    if (error) {
      throw Errors.dbError("上传图片失败", error);
    }

    const { data } = SupabaseDB.getAdminClient()
      .storage
      .from(LEGACY_PROJECT_LOGS_BUCKET)
      .getPublicUrl(objectKey);

    return {
      provider: "supabase_storage",
      bucket: LEGACY_PROJECT_LOGS_BUCKET,
      region: null,
      objectKey,
      publicUrl: data.publicUrl,
      accessUrl: data.publicUrl,
      legacyPath: objectKey,
    };
  }

  private buildCosPublicUrl(input: {
    publicBaseUrl: string;
    bucket: string;
    region: string;
    objectKey: string;
  }) {
    if (input.publicBaseUrl) {
      return joinPublicUrl(input.publicBaseUrl, input.objectKey);
    }

    return `https://${input.bucket}.cos.${input.region}.myqcloud.com/${
      trimSlashes(input.objectKey)
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")
    }`;
  }

  private setCosAccessCache(config: {
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

  private toUploadResponse(input: {
    fileId?: string;
    provider: PlatformFileProvider;
    bucket: string;
    region: string | null;
    objectKey: string;
    publicUrl: string;
    accessUrl: string;
  }): PlatformUploadResponse {
    return {
      url: input.accessUrl || input.publicUrl,
      path: input.objectKey,
      file_id: input.fileId,
      provider: input.provider,
      bucket: input.bucket,
      region: input.region,
      object_key: input.objectKey,
      storage_path: input.objectKey,
      public_url: input.publicUrl,
    };
  }

  async uploadImage(input: UploadImageInput) {
    const provider = await this.getStorageProvider();
    const uploaded = provider === "tencent_cos"
      ? await this.uploadToTencentCos(input)
      : await this.uploadToSupabase(input);

    const fileObject = await platformFileObjectRepository.create({
      tenant_id: input.tenantId ?? null,
      owner_type: input.scene,
      scene: input.scene,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      region: uploaded.region,
      object_key: uploaded.objectKey,
      original_name: input.filename ?? null,
      mime_type: input.mimetype,
      size_bytes: input.buffer.length,
      visibility: "public",
      public_url: uploaded.publicUrl,
      legacy_path: uploaded.legacyPath ?? null,
      metadata: {
        ...(uploaded.metadata || {}),
        project_id: input.projectId ?? null,
        customer_id: input.customerId ?? null,
      },
      created_by_auth_user_id: input.authUserId ?? null,
      created_by_employee_id: input.employeeId ?? null,
    });

    return this.toUploadResponse({
      fileId: fileObject.id,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      region: uploaded.region,
      objectKey: uploaded.objectKey,
      publicUrl: uploaded.publicUrl,
      accessUrl: uploaded.accessUrl,
    });
  }

  async createDirectUpload(input: DirectUploadInput) {
    const provider = await this.getStorageProvider();
    if (provider !== "tencent_cos") {
      throw Errors.business(
        503,
        "当前存储暂不支持直传",
        ErrorCodes.FILE_STORAGE_CONFIG_MISSING,
        { provider },
      );
    }

    const config = await this.getCosConfig();
    const objectKey = this.buildCosObjectKey(input);
    const cos = this.getCosClient(config);
    this.setCosAccessCache(config);

    const uploadUrl = cos.getObjectUrl({
      Bucket: config.bucket,
      Region: config.region,
      Key: objectKey,
      Method: "PUT",
      Sign: true,
      Expires: config.signedUrlTtl,
      Protocol: "https:",
    });

    return {
      provider: "tencent_cos" as const,
      bucket: config.bucket,
      region: config.region,
      object_key: objectKey,
      storage_path: objectKey,
      upload_url: uploadUrl,
      method: "PUT" as const,
      headers: {
        "content-type": input.mimetype,
      },
      expires_in: config.signedUrlTtl,
      expires_at: new Date(Date.now() + config.signedUrlTtl * 1000).toISOString(),
    };
  }

  async completeDirectUpload(input: CompleteDirectUploadInput) {
    const config = await this.getCosConfig();
    const cos = this.getCosClient(config);
    this.setCosAccessCache(config);

    let headObject;
    try {
      headObject = await cos.headObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: input.objectKey,
      });
    } catch (error) {
      throw Errors.business(
        400,
        "直传文件不存在或尚未上传完成",
        ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
        error,
      );
    }

    const existing = await platformFileObjectRepository.findActiveByObjectKey({
      provider: "tencent_cos",
      bucket: config.bucket,
      objectKey: input.objectKey,
    });
    const publicUrl = this.buildCosPublicUrl({
      publicBaseUrl: config.publicBaseUrl,
      bucket: config.bucket,
      region: config.region,
      objectKey: input.objectKey,
    });
    const accessUrl = resolveStoredFileUrl(input.objectKey) || publicUrl;

    if (existing) {
      return this.toUploadResponse({
        fileId: existing.id,
        provider: existing.provider,
        bucket: existing.bucket,
        region: existing.region,
        objectKey: existing.object_key,
        publicUrl: existing.public_url || publicUrl,
        accessUrl,
      });
    }

    const headers = (headObject.headers || {}) as Record<string, string | number | undefined>;
    const contentLength = Number(headers["content-length"] ?? input.sizeBytes);
    const contentType = String(headers["content-type"] || input.mimetype);
    const etag = normalizeEtag(input.etag) || normalizeEtag(headObject.ETag);
    const fileObject = await platformFileObjectRepository.create({
      tenant_id: input.tenantId ?? null,
      owner_type: input.scene,
      scene: input.scene,
      provider: "tencent_cos",
      bucket: config.bucket,
      region: config.region,
      object_key: input.objectKey,
      original_name: input.filename ?? null,
      mime_type: contentType,
      size_bytes: Number.isFinite(contentLength) ? contentLength : input.sizeBytes,
      checksum: etag,
      visibility: "public",
      public_url: publicUrl,
      metadata: {
        project_id: input.projectId ?? null,
        customer_id: input.customerId ?? null,
        direct_upload: true,
        signed_url: accessUrl !== publicUrl,
      },
      created_by_auth_user_id: input.authUserId ?? null,
      created_by_employee_id: input.employeeId ?? null,
    });

    return this.toUploadResponse({
      fileId: fileObject.id,
      provider: "tencent_cos",
      bucket: config.bucket,
      region: config.region,
      objectKey: input.objectKey,
      publicUrl,
      accessUrl,
    });
  }
}

export const platformFileStorageService = new PlatformFileStorageService();
