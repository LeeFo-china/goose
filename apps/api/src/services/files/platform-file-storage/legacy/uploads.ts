import {
  ErrorCodes,
  Errors,
  LEGACY_PROJECT_LOGS_BUCKET,
  SupabaseDB,
  getFileExtension,
  joinPublicUrl,
  logPlatformFileStorageTiming,
  now,
  platformFileObjectRepository,
  resolveStoredFileUrl,
  setPlatformCosAccessConfigCache,
  setPlatformCosPublicBaseUrlCache,
} from "./shared";
import type { StorageUploadResult, UploadImageInput } from "./shared";

export async function uploadToTencentCos(this: any, input: UploadImageInput): Promise<StorageUploadResult> {
  const uploadStartedAt = now();
  const config = await this.getCosConfig();
  const objectKey = this.buildCosObjectKey(input);
  const cos = this.getCosClient(config);

  try {
    const putStartedAt = now();
    await cos.putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: objectKey,
      Body: input.buffer,
      ContentLength: input.buffer.length,
      ContentType: input.mimetype,
    });
    logPlatformFileStorageTiming("cos-put-object", putStartedAt, {
      scene: input.scene,
      tenant_id: input.tenantId ?? null,
      size_bytes: input.buffer.length,
      object_key: objectKey,
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
  logPlatformFileStorageTiming("cos-upload-total", uploadStartedAt, {
    scene: input.scene,
    tenant_id: input.tenantId ?? null,
    size_bytes: input.buffer.length,
    object_key: objectKey,
  });

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

export async function uploadToSupabase(this: any, input: UploadImageInput): Promise<StorageUploadResult> {
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

export async function uploadImage(this: any, input: UploadImageInput) {
  const uploadStartedAt = now();
  const providerStartedAt = now();
  const provider = await this.getStorageProvider();
  logPlatformFileStorageTiming("provider-resolve", providerStartedAt, {
    scene: input.scene,
    tenant_id: input.tenantId ?? null,
    provider,
  });
  const uploaded = provider === "tencent_cos"
    ? await this.uploadToTencentCos(input)
    : await this.uploadToSupabase(input);

  const dbStartedAt = now();
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
  logPlatformFileStorageTiming("file-object-create", dbStartedAt, {
    scene: input.scene,
    tenant_id: input.tenantId ?? null,
    provider: uploaded.provider,
    object_key: uploaded.objectKey,
    file_id: fileObject.id,
  });
  logPlatformFileStorageTiming("upload-image-total", uploadStartedAt, {
    scene: input.scene,
    tenant_id: input.tenantId ?? null,
    provider: uploaded.provider,
    size_bytes: input.buffer.length,
    object_key: uploaded.objectKey,
    file_id: fileObject.id,
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
