import { normalizeMaterialUuid } from "./material-uuid";
import { ApiClient, ApiRequestError } from "./request";
import { inspectPrivateImageBytes } from "../platform/private-image";

export type RenderingUploadPurpose = "room" | "floor_plan";
export type RenderingUploadMime = "image/jpeg" | "image/png" | "image/webp";
export type RenderingUploadIntent = {
  intentId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
};
export type RenderingUploadResult = { fileId: string; status: "ready" };
export type RenderingUploadStatus = "issued" | "processing" | "pending_review" | "approved" | "ready" | "rejected" | "failed" | "deleted";
export type RenderingUploadProgress = { fileId: string; status: RenderingUploadStatus; reviewState: "pending" | "manual" | null };

const MAX_BYTES = 10 * 1024 * 1024;

export async function createRenderingUploadIntent(
  client: ApiClient,
  input: { purpose: RenderingUploadPurpose; mimeType: RenderingUploadMime; sizeBytes: number },
): Promise<RenderingUploadIntent> {
  if (!(["room", "floor_plan"] as string[]).includes(input.purpose)
    || !(["image/jpeg", "image/png", "image/webp"] as string[]).includes(input.mimeType)
    || !Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_BYTES) {
    throw invalidIntent();
  }
  const value = await client.request<unknown>({ method: "POST",
    path: "/douyin-mini/renderings/uploads:intent",
    data: { purpose: input.purpose, mime_type: input.mimeType, size_bytes: input.sizeBytes } });
  if (!isRecord(value) || typeof value.intent_id !== "string" || !normalizeMaterialUuid(value.intent_id)
    || value.method !== "PUT" || typeof value.upload_url !== "string"
    || !isCosUrl(value.upload_url) || !isHeaders(value.headers)
    || typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at))) {
    throw invalidResponse();
  }
  return { intentId: value.intent_id, uploadUrl: value.upload_url,
    headers: value.headers, expiresAt: value.expires_at };
}

export async function completeRenderingUpload(client: ApiClient, id: string): Promise<RenderingUploadResult> {
  const normalizedId = normalizeMaterialUuid(id);
  if (!normalizedId) throw invalidIntent();
  const value = await client.request<unknown>({ method: "POST",
    path: `/douyin-mini/renderings/uploads/${normalizedId}/complete`, data: {} });
  if (!isRecord(value) || value.file_id !== normalizedId || value.status !== "ready"
    || value.mime_type !== "image/webp" || !isPositiveInteger(value.width)
    || !isPositiveInteger(value.height) || !isPositiveInteger(value.size_bytes)) throw invalidResponse();
  return { fileId: normalizedId, status: "ready" };
}

export async function fetchRenderingUploadStatus(client: ApiClient, id: string): Promise<RenderingUploadProgress> {
  const normalizedId = normalizeMaterialUuid(id);
  if (!normalizedId) throw invalidIntent();
  const value = await client.request<unknown>({ method: "GET",
    path: `/douyin-mini/renderings/uploads/${normalizedId}` });
  if (!isRecord(value) || value.file_id !== normalizedId
    || !(["issued", "processing", "pending_review", "approved", "ready", "rejected", "failed", "deleted"] as unknown[]).includes(value.status)
    || !(value.mime_type === null || value.mime_type === "image/webp")
    || !(value.status === "pending_review"
      ? value.review_state === "pending" || value.review_state === "manual"
      : value.review_state === null)
    || ![value.width, value.height, value.size_bytes].every((item) => item === null || isPositiveInteger(item))
    || ((value.status === "ready" || value.status === "approved") && (value.mime_type !== "image/webp"
      || !isPositiveInteger(value.width) || !isPositiveInteger(value.height) || !isPositiveInteger(value.size_bytes)))) {
    throw invalidResponse();
  }
  return { fileId: normalizedId, status: value.status as RenderingUploadStatus,
    reviewState: value.review_state as RenderingUploadProgress["reviewState"] };
}

export async function completeRenderingUploadWithRetry(
  client: ApiClient, id: string,
  delay: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<RenderingUploadResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await completeRenderingUpload(client, id);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.statusCode !== 409
        || error.code !== "RENDERING_UPLOAD_PROCESSING" || attempt === 2) throw error;
      await delay(500 * (attempt + 1));
    }
  }
  throw invalidResponse();
}

export function putRenderingBytes(input: {
  uploadUrl: string;
  headers: Record<string, string>;
  bytes: ArrayBuffer;
  request?: typeof tt.request;
}): Promise<void> {
  if (!isCosUrl(input.uploadUrl) || !(input.bytes instanceof ArrayBuffer)
    || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_BYTES) return Promise.reject(invalidIntent());
  let mimeType: RenderingUploadMime;
  try { mimeType = inspectPrivateImageBytes(input.bytes).mimeType; }
  catch { return Promise.reject(invalidIntent()); }
  if (!signedHeadersMatch(input.headers, input.bytes.byteLength, mimeType)) return Promise.reject(invalidIntent());
  const request = input.request ?? tt.request;
  return new Promise((resolve, reject) => {
    let settled = false;
    let task: { abort(): void } | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      task?.abort();
      finish(() => reject(new ApiRequestError(0, "COS_PUT_UNCERTAIN", "上传结果暂无法确认")));
    }, 60_000);
    try {
      task = request({ url: input.uploadUrl, method: "PUT", data: input.bytes,
        header: input.headers, dataType: "string",
        success: (response) => finish(() => {
          if (response.statusCode >= 200 && response.statusCode < 300) resolve();
          else reject(new ApiRequestError(response.statusCode, "COS_PUT_REJECTED", "图片上传未成功"));
        }),
        fail: () => finish(() => reject(new ApiRequestError(0, "COS_PUT_UNCERTAIN", "上传结果暂无法确认"))),
      });
    } catch {
      finish(() => reject(new ApiRequestError(0, "COS_PUT_UNCERTAIN", "上传结果暂无法确认")));
    }
  });
}

function signedHeadersMatch(headers: Record<string, string>, byteLength: number, mimeType: RenderingUploadMime): boolean {
  if (!isHeaders(headers)) return false;
  const lower = new Map<string, string>();
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (lower.has(key) || key === "authorization" || key === "cookie") return false;
    lower.set(key, value);
  }
  return lower.get("content-type") === mimeType
    && lower.get("content-length") === String(byteLength)
    && lower.get("x-cos-acl") === "private"
    && lower.get("x-cos-forbid-overwrite") === "true";
}

function isCosUrl(value: string): boolean {
  return /^https:\/\/[a-z0-9][a-z0-9-]*\.cos\.[a-z0-9-]+\.myqcloud\.com\/[^#\s]+\?[^#\s]+$/.test(value);
}

function isHeaders(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function invalidIntent(): ApiRequestError {
  return new ApiRequestError(0, "INVALID_UPLOAD_INTENT", "上传参数无效");
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "私有图片上传响应无效");
}
