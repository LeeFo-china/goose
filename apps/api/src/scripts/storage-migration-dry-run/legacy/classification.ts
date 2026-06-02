import {
  getCosPublicHost,
  isCosObjectKey,
  isHttpUrl,
  LEGACY_BUCKET,
  legacyPathToPublicUrl,
} from "./shared";

export function classifyValue(value: string) {
  if (isCosObjectKey(value)) {
    return {
      valueType: "cos_object_key",
      status: "already_cos",
      legacyBucket: null,
      legacyPath: null,
      reason: null,
    };
  }

  if (isHttpUrl(value)) {
    const url = new URL(value);
    const cosHost = getCosPublicHost();
    if (cosHost && url.host === cosHost) {
      return {
        valueType: "cos_url",
        status: "already_cos",
        legacyBucket: null,
        legacyPath: null,
        reason: null,
      };
    }

    const marker = `/storage/v1/object/public/${LEGACY_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return {
        valueType: "supabase_public_url",
        status: "migratable",
        legacyBucket: LEGACY_BUCKET,
        legacyPath: decodeURIComponent(url.pathname.slice(markerIndex + marker.length)),
        reason: null,
      };
    }

    return {
      valueType: "external_url",
      status: "skipped",
      legacyBucket: null,
      legacyPath: null,
      reason: "external_url",
    };
  }

  return {
    valueType: "supabase_legacy_path",
    status: "migratable",
    legacyBucket: LEGACY_BUCKET,
    legacyPath: value.replace(/^\/+/, ""),
    reason: null,
  };
}

export async function checkRemoteSize(item: {
  status: string;
  valueType: string;
  legacyValue: string;
  legacyPath: string | null;
}) {
  if (item.status !== "migratable") {
    return { status: item.status, size: null, reason: null };
  }

  const url = item.valueType === "supabase_legacy_path" && item.legacyPath
    ? legacyPathToPublicUrl(item.legacyPath)
    : item.legacyValue;

  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      return {
        status: "download_failed",
        size: null,
        reason: `head_${response.status}`,
      };
    }

    const size = Number(response.headers.get("content-length") || "");
    return {
      status: item.status,
      size: Number.isFinite(size) ? size : null,
      reason: null,
    };
  } catch (error) {
    return {
      status: "download_failed",
      size: null,
      reason: error instanceof Error ? error.message : "head_failed",
    };
  }
}
