import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import type { MigrationItem, VerifyResult } from "./types";
import { configFor, fetchSourceRow, readBusinessValue } from "./sources";

export function objectKeyOf(item: MigrationItem) {
  return item.object_key || item.target_object_key;
}

function emptyResult(item: MigrationItem): VerifyResult {
  return {
    ...item,
    object_key: objectKeyOf(item),
    verified_status: "failed",
    file_object_status: "",
    business_field_status: "",
    access_status: "",
    current_value: "",
    reason: "",
  };
}

async function checkAccessStatus(objectKey: string) {
  const url = resolveStoredFileUrl(objectKey);
  if (!url) return "";

  const response = await fetch(url, {
    headers: {
      range: "bytes=0-31",
    },
  });
  return String(response.status);
}

export async function verifyOne(item: MigrationItem) {
  const result = emptyResult(item);
  const objectKey = objectKeyOf(item);
  const config = configFor(item);

  if (!objectKey) {
    return { ...result, reason: "missing_object_key" };
  }
  if (!config) {
    return { ...result, reason: "unsupported_source_field" };
  }

  const reasons: string[] = [];
  const fileObject = await platformFileObjectRepository.findActiveByObjectKey({
    provider: "tencent_cos",
    objectKey,
  });
  const fileObjectStatus = fileObject ? "found" : "missing";
  if (!fileObject) reasons.push("file_object_missing");

  const row = await fetchSourceRow(item.source_table, item.source_id);
  if (!row) {
    return {
      ...result,
      file_object_status: fileObjectStatus,
      business_field_status: "missing",
      reason: [...reasons, "source_row_missing"].join(";"),
    };
  }

  if (config.hasTenantId && item.tenant_id && row.tenant_id !== item.tenant_id) {
    reasons.push("tenant_mismatch");
  }

  const currentValue = readBusinessValue({ item, config, row });
  const businessFieldStatus = currentValue === objectKey ? "matched" : "mismatch";
  if (businessFieldStatus !== "matched") {
    reasons.push("business_field_mismatch");
  }

  let accessStatus = "";
  try {
    accessStatus = await checkAccessStatus(objectKey);
    if (!["200", "206"].includes(accessStatus)) {
      reasons.push(`access_${accessStatus || "empty"}`);
    }
  } catch (error) {
    accessStatus = error instanceof Error ? error.message : "access_failed";
    reasons.push(accessStatus);
  }

  return {
    ...result,
    verified_status: reasons.length === 0 ? "passed" : "failed",
    file_object_status: fileObjectStatus,
    business_field_status: businessFieldStatus,
    access_status: accessStatus,
    current_value: typeof currentValue === "string"
      ? currentValue
      : JSON.stringify(currentValue ?? null),
    reason: reasons.join(";"),
  };
}
