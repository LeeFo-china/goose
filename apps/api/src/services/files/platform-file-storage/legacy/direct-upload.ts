import { ErrorCodes, Errors, getFilenameFromObjectKey, getMimeTypeFromObjectKey, normalizeEtag, platformFileObjectRepository, resolveStoredFileUrl } from "./shared";
import type { CompleteDirectUploadInput, DirectUploadInput, RegisterExistingCosObjectInput } from "./shared";

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

  const uploadUrl = cos.getObjectUrl({
    Bucket: config.bucket,
    Region: config.region,
    Key: objectKey,
    Method: "PUT",
    Sign: true,
    Expires: config.signedUrlTtl,
    UseAccelerate: config.uploadUseAccelerate,
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

export async function completeDirectUpload(this: any, input: CompleteDirectUploadInput) {
  return this.registerExistingCosObject({
    ...input,
    verifyHead: this.shouldVerifyDirectUploadHead(),
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

  let headObject: {
    headers?: Record<string, string | number | undefined>;
    ETag?: string | null;
  } | null = null;
  const verifyHeadObject = Boolean(input.verifyHead);
  if (verifyHeadObject) {
    try {
      headObject = await cos.headObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: input.objectKey,
      });
    } catch (error) {
      if (!input.failIfMissing) {
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

  const visitorId = input.visitorId?.trim() || null;
  const isPrivateLicense = input.scene === "tenant_onboarding_license"
    && input.visibility === "private";
  if (input.scene === "tenant_onboarding_license" && (!isPrivateLicense || !visitorId)) {
    throw Errors.forbidden();
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
  const contentLength = Number(headers["content-length"] ?? fallbackSize);
  const contentType = String(
    headers["content-type"] || input.mimetype || getMimeTypeFromObjectKey(input.objectKey),
  );
  const etag = normalizeEtag(input.etag) || normalizeEtag(headObject?.ETag);
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
