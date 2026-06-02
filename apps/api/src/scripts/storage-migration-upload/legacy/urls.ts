import { SupabaseDB } from "@/utils/supabase";

const LEGACY_BUCKET = "project-logs";
export const DOWNLOAD_TIMEOUT_MS = 30_000;
export const ACCESS_CHECK_TIMEOUT_MS = 10_000;

function trimSlashes(value: string) {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function encodeObjectKey(objectKey: string) {
  return trimSlashes(objectKey)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function joinPublicUrl(baseUrl: string, objectKey: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeObjectKey(objectKey)}`;
}

export function legacyPathToPublicUrl(path: string) {
  return SupabaseDB.getAdminClient()
    .storage
    .from(LEGACY_BUCKET)
    .getPublicUrl(path)
    .data.publicUrl;
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`fetch_timeout_${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { response, buffer };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`download_timeout_${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function guessMimeType(input: { contentType: string | null; objectKey: string }) {
  const contentType = input.contentType?.split(";")[0]?.trim();
  if (contentType) {
    return contentType;
  }

  const lower = input.objectKey.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "application/octet-stream";
}
