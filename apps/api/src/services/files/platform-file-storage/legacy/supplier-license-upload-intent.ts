import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizePrivateUploadMimeType } from "./private-upload-intent";

const INTENT_VERSION = "v1";
const INTENT_KEY_DERIVATION_LABEL =
  "gooes:supplier-license-upload-intent:v1";

type SupplierLicenseUploadIntentPayload = {
  scene: "supplier_business_license";
  employee_hash: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  expires_at: number;
};

type SupplierLicenseUploadIntentInput = {
  secretKey: string;
  scene: string;
  employeeId: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
};

export type SupplierLicenseUploadIntentClaims = {
  scene: "supplier_business_license";
  employeeHash: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresAtSeconds: number;
};

export function hashSupplierLicenseEmployeeId(employeeId: string) {
  return createHash("sha256").update(employeeId.trim()).digest("hex");
}

export function createSupplierLicenseUploadIntent(
  input: SupplierLicenseUploadIntentInput & { expiresAtSeconds: number },
) {
  const payload: SupplierLicenseUploadIntentPayload = {
    scene: "supplier_business_license",
    employee_hash: hashSupplierLicenseEmployeeId(input.employeeId),
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

export function verifySupplierLicenseUploadIntent(
  input: SupplierLicenseUploadIntentInput & {
    token: string;
    nowSeconds: number;
  },
): SupplierLicenseUploadIntentClaims | null {
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
  const expectedEmployeeHash = hashSupplierLicenseEmployeeId(input.employeeId);
  const expectedMimeType = normalizePrivateUploadMimeType(input.mimeType);
  if (
    payload.scene !== input.scene ||
    payload.employee_hash !== expectedEmployeeHash ||
    payload.object_key !== input.objectKey ||
    payload.mime_type !== expectedMimeType ||
    payload.size_bytes !== input.sizeBytes
  ) return null;

  return {
    scene: payload.scene,
    employeeHash: payload.employee_hash,
    objectKey: payload.object_key,
    mimeType: payload.mime_type,
    sizeBytes: payload.size_bytes,
    expiresAtSeconds: payload.expires_at,
  };
}

function deriveIntentKey(secretKey: string) {
  return createHmac("sha256", secretKey)
    .update(INTENT_KEY_DERIVATION_LABEL)
    .digest();
}

function parsePayload(
  encodedPayload: string,
): SupplierLicenseUploadIntentPayload | null {
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
    ];
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== expectedKeys[index]) ||
      payload.scene !== "supplier_business_license" ||
      typeof payload.employee_hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(payload.employee_hash) ||
      typeof payload.object_key !== "string" ||
      typeof payload.mime_type !== "string" ||
      !Number.isInteger(payload.size_bytes) ||
      Number(payload.size_bytes) <= 0 ||
      !Number.isInteger(payload.expires_at) ||
      Number(payload.expires_at) <= 0
    ) return null;
    return payload as SupplierLicenseUploadIntentPayload;
  } catch {
    return null;
  }
}
