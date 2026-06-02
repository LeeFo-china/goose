import { createHash } from "node:crypto";
import { basename } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import {
  refreshPlatformCosPublicBaseUrlCache,
  resolveStoredFileUrl,
} from "@/services/files/file-url-resolver";
import type { CosConfig, DryRunItem, MigrationResult } from "./types";
import {
  ACCESS_CHECK_TIMEOUT_MS,
  DOWNLOAD_TIMEOUT_MS,
  downloadWithTimeout,
  fetchWithTimeout,
  guessMimeType,
  joinPublicUrl,
  legacyPathToPublicUrl,
} from "./urls";

const COS_UPLOAD_TIMEOUT_MS = 180_000;

function sceneForItem(item: DryRunItem) {
  if (item.source_table === "project_logs") return "project_log";
  if (item.source_table === "project_log_comments") return "project_log_comment";
  if (item.source_table === "customer_follow_up_comments") {
    return "customer_follow_up_comment";
  }
  if (item.source_table === "customers") return "customer_douyin_screenshot";
  if (item.source_table === "expense_request_items") return "expense_request";
  if (item.source_table === "expense_request_settlements") {
    return "expense_request_settlement";
  }
  if (item.source_table === "project_referrals") return "referral_payment";
  if (item.source_table === "employees") return "employee_avatar";
  if (item.source_table === "marketing_pages") return "h5_marketing_page";
  if (item.source_table.startsWith("project_acceptance")) return "project_acceptance";
  return item.source_table;
}

async function downloadLegacyObject(item: DryRunItem) {
  const url = item.value_type === "supabase_legacy_path"
    ? legacyPathToPublicUrl(item.legacy_path)
    : item.legacy_value;
  const { response, buffer } = await downloadWithTimeout(url, DOWNLOAD_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`download_${response.status}`);
  }

  return {
    buffer,
    mimeType: guessMimeType({
      contentType: response.headers.get("content-type"),
      objectKey: item.target_object_key,
    }),
  };
}

async function checkPublicUrl(url: string) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          range: "bytes=0-31",
        },
      },
      ACCESS_CHECK_TIMEOUT_MS,
    );
    return String(response.status);
  } catch (error) {
    return error instanceof Error ? error.message : "check_failed";
  }
}

async function putObjectWithTimeout(cos: COS, params: COS.PutObjectParams) {
  await Promise.race([
    cos.putObject(params),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`cos_upload_timeout_${COS_UPLOAD_TIMEOUT_MS}ms`)),
        COS_UPLOAD_TIMEOUT_MS,
      );
    }),
  ]);
}

export async function migrateOne(input: {
  item: DryRunItem;
  config: CosConfig;
  cos: COS;
  apply: boolean;
}): Promise<MigrationResult> {
  const { item, config, cos, apply } = input;
  const emptyResult: MigrationResult = {
    ...item,
    migrated_status: "skipped",
    file_id: "",
    provider: "tencent_cos",
    bucket: config.bucket,
    region: config.region,
    object_key: item.target_object_key,
    public_url: "",
    mime_type: "",
    size_bytes: "",
    checksum: "",
    access_url_http_status: "",
    migrated_reason: "",
  };

  if (item.status !== "migratable" || !item.target_object_key) {
    return {
      ...emptyResult,
      migrated_reason: item.reason || `dry_run_status_${item.status}`,
    };
  }

  const existing = await platformFileObjectRepository.findActiveByObjectKey({
    provider: "tencent_cos",
    bucket: config.bucket,
    objectKey: item.target_object_key,
  });
  if (existing) {
    return {
      ...emptyResult,
      migrated_status: "already_exists",
      file_id: existing.id,
      public_url: existing.public_url || "",
      mime_type: existing.mime_type,
      size_bytes: String(existing.size_bytes),
      checksum: existing.checksum || "",
      access_url_http_status: resolveStoredFileUrl(existing.object_key)
        ? await checkPublicUrl(resolveStoredFileUrl(existing.object_key) || "")
        : "",
      migrated_reason: "platform_file_object_exists",
    };
  }

  if (!apply) {
    return {
      ...emptyResult,
      migrated_status: "planned",
      public_url: joinPublicUrl(config.publicBaseUrl, item.target_object_key),
      access_url_http_status: "",
      migrated_reason: "apply_not_set",
    };
  }

  const downloaded = await downloadLegacyObject(item);
  const checksum = createHash("sha256").update(downloaded.buffer).digest("hex");

  await putObjectWithTimeout(cos, {
    Bucket: config.bucket,
    Region: config.region,
    Key: item.target_object_key,
    Body: downloaded.buffer,
    ContentLength: downloaded.buffer.length,
    ContentType: downloaded.mimeType,
  });

  const publicUrl = joinPublicUrl(config.publicBaseUrl, item.target_object_key);
  await refreshPlatformCosPublicBaseUrlCache();
  const accessUrl = resolveStoredFileUrl(item.target_object_key) || publicUrl;
  const accessUrlHttpStatus = await checkPublicUrl(accessUrl);
  const fileObject = await platformFileObjectRepository.create({
    tenant_id: item.tenant_id || null,
    owner_type: item.source_table,
    owner_id: item.source_id || null,
    scene: sceneForItem(item),
    provider: "tencent_cos",
    bucket: config.bucket,
    region: config.region,
    object_key: item.target_object_key,
    original_name: basename(item.legacy_path || item.legacy_value) || null,
    mime_type: downloaded.mimeType,
    size_bytes: downloaded.buffer.length,
    checksum,
    visibility: "public",
    public_url: publicUrl,
    legacy_url: item.value_type === "supabase_public_url" ? item.legacy_value : null,
    legacy_path: item.legacy_path || null,
    metadata: {
      migration_source: "storage-migration-upload",
      dry_run_status: item.status,
      source_table: item.source_table,
      source_id: item.source_id,
      source_field: item.source_field,
      array_index: item.array_index || null,
      legacy_value: item.legacy_value,
    },
  });

  return {
    ...emptyResult,
    migrated_status: "uploaded",
    file_id: fileObject.id,
    public_url: publicUrl,
    mime_type: downloaded.mimeType,
    size_bytes: String(downloaded.buffer.length),
    checksum,
    access_url_http_status: accessUrlHttpStatus,
  };
}
