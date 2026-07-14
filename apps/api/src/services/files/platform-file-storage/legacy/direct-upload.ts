import { ErrorCodes, Errors, getFilenameFromObjectKey, getMimeTypeFromObjectKey, normalizeEtag, platformFileObjectRepository, resolveStoredFileUrl } from "./shared";
import type { CompleteDirectUploadInput, DirectUploadInput, RegisterExistingCosObjectInput } from "./shared";
import { buildTenantOnboardingLicenseVisitorPrefix } from "./paths";
import {
  createPrivateUploadIntent,
  normalizePrivateUploadMimeType,
  TENANT_ONBOARDING_LICENSE_MAX_SIZE_BYTES,
  TENANT_ONBOARDING_LICENSE_MIME_TYPES,
  verifyPrivateUploadIntent,
} from "./private-upload-intent";

const PRIVATE_LICENSE_SCENE = "tenant_onboarding_license";

export async function createDirectUpload(this: any, input: DirectUploadInput) {
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
  const visitorId = input.visitorId?.trim() || null;
  const isPrivateLicense = input.scene === PRIVATE_LICENSE_SCENE
    && input.visibility === "private";
  if (input.scene === PRIVATE_LICENSE_SCENE && (!isPrivateLicense || !visitorId)) {
    throw Errors.forbidden();
  }
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + config.signedUrlTtl;
  // COS only enforces this overwrite guard when bucket versioning is disabled.
  // Task 13 must verify the target bucket setting before release.
  const signedHeaders = isPrivateLicense
    ? {
      "Content-Length": input.sizeBytes,
      "x-cos-forbid-overwrite": true,
    }
    : undefined;

  const uploadUrl = cos.getObjectUrl({
    Bucket: config.bucket,
    Region: config.region,
    Key: objectKey,
    Method: "PUT",
    Sign: true,
    Expires: config.signedUrlTtl,
    UseAccelerate: config.uploadUseAccelerate,
    Protocol: "https:",
    ...(signedHeaders ? { Headers: signedHeaders } : {}),
  });
  const uploadIntent = isPrivateLicense && visitorId
    ? createPrivateUploadIntent({
      secretKey: config.secretKey,
      objectKey,
      visitorId,
      mimeType: input.mimetype,
      sizeBytes: input.sizeBytes,
      expiresAtSeconds,
    })
    : undefined;

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
      ...(isPrivateLicense
        ? {
          "content-length": String(input.sizeBytes),
          "x-cos-forbid-overwrite": true,
        }
        : {}),
    },
    expires_in: config.signedUrlTtl,
    expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
    ...(uploadIntent ? { upload_intent: uploadIntent } : {}),
  };
}

export async function completeDirectUpload(this: any, input: CompleteDirectUploadInput) {
  const isPrivateLicense = input.scene === PRIVATE_LICENSE_SCENE;
  return this.registerExistingCosObject({
    ...input,
    verifyHead: isPrivateLicense || this.shouldVerifyDirectUploadHead(),
    failIfMissing: true,
    metadata: {
      direct_upload: true,
    },
  });
}

export async function registerExistingCosObject(this: any, input: RegisterExistingCosObjectInput) {
  const config = await this.getCosConfig();
  const cos = this.getCosClient(config);
  this.setCosAccessCache(config);
  const visitorId = input.visitorId?.trim() || null;
  const isPrivateLicense = input.scene === PRIVATE_LICENSE_SCENE
    && input.visibility === "private";
  if (input.scene === PRIVATE_LICENSE_SCENE && (!isPrivateLicense || !visitorId)) {
    throw Errors.forbidden();
  }
  if (isPrivateLicense && visitorId) {
    assertPrivateLicenseIntent({
      input,
      visitorId,
      secretKey: config.secretKey,
    });
  }

  let headObject: {
    headers?: Record<string, string | number | undefined>;
    ETag?: string | null;
  } | null = null;
  const verifyHeadObject = isPrivateLicense || Boolean(input.verifyHead);
  if (verifyHeadObject) {
    try {
      headObject = await cos.headObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: input.objectKey,
      });
    } catch (error) {
      if (!isPrivateLicense && !input.failIfMissing) {
        throw error;
      }

      throw Errors.business(
        400,
        "直传文件不存在或尚未上传完成",
        ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
        error,
      );
    }
  }

  const publicUrl = isPrivateLicense
    ? null
    : this.buildCosPublicUrl({
      publicBaseUrl: config.publicBaseUrl,
      bucket: config.bucket,
      region: config.region,
      objectKey: input.objectKey,
    });
  const accessUrl = isPrivateLicense
    ? null
    : resolveStoredFileUrl(input.objectKey) || publicUrl;

  const headers = (headObject?.headers || {}) as Record<string, string | number | undefined>;
  const fallbackSize = input.sizeBytes ?? 0;
  const privateMetadata = isPrivateLicense
    ? requirePrivateLicenseHeadMetadata({ input, headObject, headers })
    : null;
  const contentLength = privateMetadata?.contentLength
    ?? Number(getHeader(headers, "content-length") ?? fallbackSize);
  const contentType = privateMetadata?.contentType ?? String(
    getHeader(headers, "content-type") || input.mimetype ||
      getMimeTypeFromObjectKey(input.objectKey),
  );
  const etag = privateMetadata?.etag
    ?? normalizeEtag(input.etag) ?? normalizeEtag(headObject?.ETag);
  const fileObject = await platformFileObjectRepository.createOrFindByObjectKey({
    tenant_id: input.tenantId ?? null,
    owner_type: isPrivateLicense ? "visitor" : input.ownerType ?? input.scene,
    owner_id: input.ownerId ?? null,
    owner_visitor_id: isPrivateLicense ? visitorId : null,
    scene: input.scene,
    provider: "tencent_cos",
    bucket: config.bucket,
    region: config.region,
    object_key: input.objectKey,
    original_name: input.filename ?? getFilenameFromObjectKey(input.objectKey),
    mime_type: contentType,
    size_bytes: Number.isFinite(contentLength) ? contentLength : fallbackSize,
    checksum: etag,
    visibility: input.visibility ?? "public",
    public_url: publicUrl,
    metadata: {
      ...(input.metadata || {}),
      project_id: input.projectId ?? null,
      customer_id: input.customerId ?? null,
      verified_head_object: verifyHeadObject,
      signed_url: Boolean(accessUrl && accessUrl !== publicUrl),
    },
    created_by_auth_user_id: input.authUserId ?? null,
    created_by_employee_id: input.employeeId ?? null,
  });

  if (isPrivateLicense) {
    return { file_id: fileObject.id, status: fileObject.status };
  }

  return this.toUploadResponse({
    fileId: fileObject.id,
    provider: fileObject.provider,
    bucket: fileObject.bucket,
    region: fileObject.region,
    objectKey: fileObject.object_key,
    publicUrl: fileObject.public_url || publicUrl || "",
    accessUrl: accessUrl || "",
  });
}

function assertPrivateLicenseIntent(input: {
  input: RegisterExistingCosObjectInput;
  visitorId: string;
  secretKey: string;
}) {
  const declaredMimeType = normalizePrivateUploadMimeType(input.input.mimetype ?? "");
  const declaredSize = input.input.sizeBytes ?? 0;
  const expectedPrefix = buildTenantOnboardingLicenseVisitorPrefix(input.visitorId);
  if (!input.input.objectKey.startsWith(expectedPrefix)) {
    throw privateUploadError("私有上传对象路径无效");
  }
  if (
    !TENANT_ONBOARDING_LICENSE_MIME_TYPES.has(declaredMimeType) ||
    !Number.isInteger(declaredSize) || declaredSize <= 0 ||
    declaredSize > TENANT_ONBOARDING_LICENSE_MAX_SIZE_BYTES
  ) {
    throw privateUploadError("私有上传声明无效");
  }
  const verified = verifyPrivateUploadIntent({
    token: input.input.uploadIntent?.trim() || "",
    secretKey: input.secretKey,
    objectKey: input.input.objectKey,
    visitorId: input.visitorId,
    mimeType: declaredMimeType,
    sizeBytes: declaredSize,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verified) throw privateUploadError("私有上传凭证无效或已过期");
}

function requirePrivateLicenseHeadMetadata(input: {
  input: RegisterExistingCosObjectInput;
  headObject: {
    headers?: Record<string, string | number | undefined>;
    ETag?: string | null;
  } | null;
  headers: Record<string, string | number | undefined>;
}) {
  const contentLength = parseContentLength(getHeader(input.headers, "content-length"));
  const contentType = normalizePrivateUploadMimeType(
    String(getHeader(input.headers, "content-type") ?? ""),
  );
  const declaredContentType = normalizePrivateUploadMimeType(input.input.mimetype ?? "");
  const declaredSize = input.input.sizeBytes ?? 0;
  if (
    contentLength === null || contentLength <= 0 ||
    contentLength > TENANT_ONBOARDING_LICENSE_MAX_SIZE_BYTES ||
    contentLength !== declaredSize
  ) throw privateUploadError("营业执照文件大小校验失败");
  if (
    !TENANT_ONBOARDING_LICENSE_MIME_TYPES.has(contentType) ||
    contentType !== declaredContentType
  ) throw privateUploadError("营业执照文件类型校验失败");

  const headEtag = normalizeEtag(input.headObject?.ETag)
    ?? normalizeEtag(String(getHeader(input.headers, "etag") ?? ""));
  const clientEtag = normalizeEtag(input.input.etag);
  if (!headEtag || (clientEtag && clientEtag !== headEtag)) {
    throw privateUploadError("营业执照文件校验值不一致");
  }
  return { contentLength, contentType, etag: headEtag };
}

function getHeader(
  headers: Record<string, string | number | undefined>,
  name: string,
) {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

function parseContentLength(value: string | number | undefined) {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function privateUploadError(message: string) {
  return Errors.business(
    400,
    message,
    ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
  );
}
