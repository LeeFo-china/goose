import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const INTENT_VERSION = "v1";
export const TENANT_ONBOARDING_LICENSE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const TENANT_ONBOARDING_LICENSE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type EncodedPrivateUploadIntent = {
  object_key: string;
  visitor_hash: string;
  mime_type: string;
  size_bytes: number;
  expires_at: number;
};

export type PrivateUploadIntentClaims = {
  objectKey: string;
  visitorHash: string;
  mimeType: string;
  sizeBytes: number;
  expiresAtSeconds: number;
};

type CreatePrivateUploadIntentInput = {
  secretKey: string;
  objectKey: string;
  visitorId: string;
  mimeType: string;
  sizeBytes: number;
  expiresAtSeconds: number;
};

type VerifyPrivateUploadIntentInput = Omit<
  CreatePrivateUploadIntentInput,
  "expiresAtSeconds"
> & {
  token: string;
  nowSeconds: number;
};

export function hashPrivateUploadVisitorId(visitorId: string) {
  return createHash("sha256").update(visitorId.trim()).digest("hex");
}

export function normalizePrivateUploadMimeType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function createPrivateUploadIntent(
  input: CreatePrivateUploadIntentInput,
) {
  const payload: EncodedPrivateUploadIntent = {
    object_key: input.objectKey,
    visitor_hash: hashPrivateUploadVisitorId(input.visitorId),
    mime_type: normalizePrivateUploadMimeType(input.mimeType),
    size_bytes: input.sizeBytes,
    expires_at: input.expiresAtSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signedValue = `${INTENT_VERSION}.${encodedPayload}`;
  const signature = createHmac("sha256", input.secretKey)
    .update(signedValue)
    .digest("base64url");
  return `${signedValue}.${signature}`;
}

export function verifyPrivateUploadIntent(
  input: VerifyPrivateUploadIntentInput,
): PrivateUploadIntentClaims | null {
  const parts = input.token.split(".");
  if (parts.length !== 3 || parts[0] !== INTENT_VERSION) return null;
  const encodedPayload = parts[1] ?? "";
  const encodedSignature = parts[2] ?? "";
  if (!/^[A-Za-z0-9_-]+$/.test(encodedPayload)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(encodedSignature)) return null;

  const expectedSignature = createHmac("sha256", input.secretKey)
    .update(`${INTENT_VERSION}.${encodedPayload}`)
    .digest();
  const receivedSignature = Buffer.from(encodedSignature, "base64url");
  const comparableSignature = Buffer.alloc(expectedSignature.length);
  receivedSignature.copy(
    comparableSignature,
    0,
    0,
    Math.min(receivedSignature.length, comparableSignature.length),
  );
  const hasExpectedLength = receivedSignature.length === expectedSignature.length;
  const hasValidSignature = timingSafeEqual(comparableSignature, expectedSignature);
  if (!hasExpectedLength || !hasValidSignature) return null;

  const payload = parsePayload(encodedPayload);
  if (!payload || payload.expires_at <= input.nowSeconds) return null;
  const expectedMimeType = normalizePrivateUploadMimeType(input.mimeType);
  const expectedVisitorHash = hashPrivateUploadVisitorId(input.visitorId);
  if (
    payload.object_key !== input.objectKey ||
    payload.visitor_hash !== expectedVisitorHash ||
    payload.mime_type !== expectedMimeType ||
    payload.size_bytes !== input.sizeBytes
  ) return null;

  return {
    objectKey: payload.object_key,
    visitorHash: payload.visitor_hash,
    mimeType: payload.mime_type,
    sizeBytes: payload.size_bytes,
    expiresAtSeconds: payload.expires_at,
  };
}

function parsePayload(encodedPayload: string): EncodedPrivateUploadIntent | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (!isRecord(parsed)) return null;
    const keys = Object.keys(parsed).sort();
    const expectedKeys = [
      "expires_at",
      "mime_type",
      "object_key",
      "size_bytes",
      "visitor_hash",
    ];
    if (keys.length !== expectedKeys.length) return null;
    if (keys.some((key, index) => key !== expectedKeys[index])) return null;
    if (typeof parsed.object_key !== "string") return null;
    if (
      typeof parsed.visitor_hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(parsed.visitor_hash)
    ) return null;
    if (typeof parsed.mime_type !== "string") return null;
    if (!Number.isInteger(parsed.size_bytes) || Number(parsed.size_bytes) <= 0) return null;
    if (!Number.isInteger(parsed.expires_at) || Number(parsed.expires_at) <= 0) return null;
    return parsed as EncodedPrivateUploadIntent;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
