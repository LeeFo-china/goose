import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { normalizePrivateUploadMimeType } from "./private-upload-intent";

const INTENT_VERSION = "v1";

type PublicEmployeeUploadIntentPayload = {
  scene: string;
  tenant_hash: string | null;
  employee_hash: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  expires_at: number;
};

export type PublicEmployeeUploadIntentInput = {
  secretKey: string;
  scene: string;
  tenantId: string | null;
  employeeId: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
};

export type PublicEmployeeUploadIntentClaims = {
  scene: string;
  tenantHash: string | null;
  employeeHash: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresAtSeconds: number;
};

type PublicEmployeeUploadIntentOptions = {
  expectedScene: string;
  keyDerivationLabel: string;
};

export function createPublicEmployeeUploadIntent(
  input: PublicEmployeeUploadIntentInput & { expiresAtSeconds: number },
  options: PublicEmployeeUploadIntentOptions,
) {
  const payload: PublicEmployeeUploadIntentPayload = {
    scene: options.expectedScene,
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
  const signature = createHmac(
    "sha256",
    deriveIntentKey(input.secretKey, options.keyDerivationLabel),
  ).update(signedValue).digest("base64url");
  return `${signedValue}.${signature}`;
}

export function verifyPublicEmployeeUploadIntent(
  input: PublicEmployeeUploadIntentInput & {
    token: string;
    nowSeconds: number;
  },
  options: PublicEmployeeUploadIntentOptions,
): PublicEmployeeUploadIntentClaims | null {
  const parts = input.token.split(".");
  if (parts.length !== 3 || parts[0] !== INTENT_VERSION) return null;
  const encodedPayload = parts[1] ?? "";
  const encodedSignature = parts[2] ?? "";
  if (
    !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
    !/^[A-Za-z0-9_-]+$/.test(encodedSignature)
  ) return null;

  const expectedSignature = createHmac(
    "sha256",
    deriveIntentKey(input.secretKey, options.keyDerivationLabel),
  ).update(`${INTENT_VERSION}.${encodedPayload}`).digest();
  const receivedSignature = Buffer.from(encodedSignature, "base64url");
  const comparableSignature = Buffer.alloc(expectedSignature.length);
  receivedSignature.copy(
    comparableSignature,
    0,
    0,
    Math.min(receivedSignature.length, comparableSignature.length),
  );
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(comparableSignature, expectedSignature)
  ) return null;

  const payload = parsePayload(encodedPayload, options.expectedScene);
  if (!payload || payload.expires_at <= input.nowSeconds) return null;
  const expectedTenantHash = input.tenantId
    ? hashIdentifier(input.tenantId)
    : null;
  if (
    input.scene !== options.expectedScene ||
    payload.tenant_hash !== expectedTenantHash ||
    payload.employee_hash !== hashIdentifier(input.employeeId) ||
    payload.object_key !== input.objectKey ||
    payload.mime_type !== normalizePrivateUploadMimeType(input.mimeType) ||
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

function hashIdentifier(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

function deriveIntentKey(secretKey: string, label: string) {
  return createHmac("sha256", secretKey).update(label).digest();
}

function parsePayload(
  encodedPayload: string,
  expectedScene: string,
): PublicEmployeeUploadIntentPayload | null {
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
      payload.scene !== expectedScene ||
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
    return payload as PublicEmployeeUploadIntentPayload;
  } catch {
    return null;
  }
}
