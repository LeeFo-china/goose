import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import type { PlatformFileProvider } from "@/repositories/platform-file-objects";
import { systemSettingsService } from "@/services/system-settings";
import { SupabaseDB } from "@/utils/supabase";
import { setPlatformCosPublicBaseUrlCache } from "@/services/files/file-url-resolver";

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

type StorageUploadResult = {
  provider: PlatformFileProvider;
  bucket: string;
  region: string | null;
  objectKey: string;
  publicUrl: string;
  legacyPath?: string | null;
  metadata?: Record<string, unknown>;
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
    const [secretId, secretKey, bucket, region, publicBaseUrl, signedUrlTtl] =
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

  private buildCosObjectKey(input: UploadImageInput) {
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

    return {
      provider: "tencent_cos",
      bucket: config.bucket,
      region: config.region,
      objectKey,
      publicUrl,
      metadata: {
        signed_url: !config.publicBaseUrl,
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
      legacyPath: objectKey,
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

    return {
      url: uploaded.publicUrl,
      path: uploaded.provider === "tencent_cos"
        ? uploaded.publicUrl
        : uploaded.objectKey,
      file_id: fileObject.id,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      region: uploaded.region,
      object_key: uploaded.objectKey,
      storage_path: uploaded.objectKey,
    };
  }
}

export const platformFileStorageService = new PlatformFileStorageService();
