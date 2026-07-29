import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { normalizePrivateUploadMimeType } from "./private-upload-intent";
import type {
  DirectUploadInput,
  RegisterExistingCosObjectInput,
} from "./shared";

const INTENT_VERSION = "v1";
const INTENT_KEY_DERIVATION_LABEL = "gooes:brand-logo-upload-intent:v1";

type BrandLogoUploadIntentPayload = {
  scene: "brand_logo";
  tenant_hash: string | null;
  employee_hash: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  expires_at: number;
};

type BrandLogoUploadIntentInput = {
  secretKey: string;
  scene: string;
  tenantId: string | null;
  employeeId: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
};

export type BrandLogoUploadIntentClaims = {
  scene: "brand_logo";
  tenantHash: string | null;
  employeeHash: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresAtSeconds: number;
};

function hashIdentifier(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function createBrandLogoUploadIntent(
  input: BrandLogoUploadIntentInput & { expiresAtSeconds: number },
) {
  const payload: BrandLogoUploadIntentPayload = {
    scene: "brand_logo",
    tenant_hash: input.tenantId ? hashIdentifier(input.tenantId) : null,
    employee_hash: hashIdentifier(input.employeeId),
    object_key: input.objectKey,
    mime_type: normalizePrivateUploadMimeType(input.mimeType),
    size_bytes: input.sizeBytes,
    expires_at: input.expiresAtSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signedValue = `${INTENT_VERSION}.${encodedPayload}`;
  const signature = createHmac("sha256", deriveIntentKey(input.secretKey))
    .update(signedValue)
    .digest("base64url");
  return `${signedValue}.${signature}`;
}

export function createDirectBrandLogoUploadIntent(
  input: DirectUploadInput,
  signing: {
    secretKey: string;
    objectKey: string;
    expiresAtSeconds: number;
  },
) {
  return createBrandLogoUploadIntent({
    secretKey: signing.secretKey,
    scene: input.scene,
    tenantId: input.tenantId ?? null,
    employeeId: input.employeeId!,
    objectKey: signing.objectKey,
    mimeType: input.mimetype,
    sizeBytes: input.sizeBytes,
    expiresAtSeconds: signing.expiresAtSeconds,
  });
}

export function verifyBrandLogoUploadIntent(
  input: BrandLogoUploadIntentInput & {
    token: string;
    nowSeconds: number;
  },
): BrandLogoUploadIntentClaims | null {
  const parts = input.token.split(".");
  if (parts.length !== 3 || parts[0] !== INTENT_VERSION) return null;
  const encodedPayload = parts[1] ?? "";
  const encodedSignature = parts[2] ?? "";
  if (
    !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
    !/^[A-Za-z0-9_-]+$/.test(encodedSignature)
  ) return null;

  const expectedSignature = createHmac("sha256", deriveIntentKey(input.secretKey))
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
  if (!timingSafeEqual(comparableSignature, expectedSignature) || !hasExpectedLength) {
    return null;
  }

  const payload = parsePayload(encodedPayload);
  if (!payload || payload.expires_at <= input.nowSeconds) return null;
  const expectedTenantHash = input.tenantId
    ? hashIdentifier(input.tenantId)
    : null;
  const expectedEmployeeHash = hashIdentifier(input.employeeId);
  const expectedMimeType = normalizePrivateUploadMimeType(input.mimeType);
  if (
    payload.scene !== input.scene ||
    payload.tenant_hash !== expectedTenantHash ||
    payload.employee_hash !== expectedEmployeeHash ||
    payload.object_key !== input.objectKey ||
    payload.mime_type !== expectedMimeType ||
    payload.size_bytes !== input.sizeBytes
  ) return null;

  return {
    scene: payload.scene,
    tenantHash: payload.tenant_hash,
    employeeHash: payload.employee_hash,
    objectKey: payload.object_key,
    mimeType: payload.mime_type,
    sizeBytes: payload.size_bytes,
    expiresAtSeconds: payload.expires_at,
  };
}

export function assertValidBrandLogoUploadIntent(
  input: RegisterExistingCosObjectInput,
  secretKey: string,
) {
  if (verifyBrandLogoUploadIntent({
    token: input.uploadIntent?.trim() || "",
    secretKey,
    scene: input.scene,
    tenantId: input.tenantId ?? null,
    employeeId: input.employeeId!,
    objectKey: input.objectKey,
    mimeType: input.mimetype ?? "",
    sizeBytes: input.sizeBytes ?? 0,
    nowSeconds: Math.floor(Date.now() / 1000),
  })) return;
  throw Errors.business(
    400,
    "品牌 Logo 上传凭证无效或已过期",
    ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
  );
}

function deriveIntentKey(secretKey: string) {
  return createHmac("sha256", secretKey)
    .update(INTENT_KEY_DERIVATION_LABEL)
    .digest();
}

function parsePayload(
  encodedPayload: string,
): BrandLogoUploadIntentPayload | null {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const payload = value as Record<string, unknown>;
    const keys = Object.keys(payload).sort();
    const expectedKeys = [
      "employee_hash",
      "expires_at",
      "mime_type",
      "object_key",
      "scene",
      "size_bytes",
      "tenant_hash",
    ];
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== expectedKeys[index]) ||
      payload.scene !== "brand_logo" ||
      (
        payload.tenant_hash !== null &&
        (
          typeof payload.tenant_hash !== "string" ||
          !/^[a-f0-9]{64}$/.test(payload.tenant_hash)
        )
      ) ||
      typeof payload.employee_hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(payload.employee_hash) ||
      typeof payload.object_key !== "string" ||
      typeof payload.mime_type !== "string" ||
      !Number.isInteger(payload.size_bytes) ||
      Number(payload.size_bytes) <= 0 ||
      !Number.isInteger(payload.expires_at) ||
      Number(payload.expires_at) <= 0
    ) return null;
    return payload as BrandLogoUploadIntentPayload;
  } catch {
    return null;
  }
}
