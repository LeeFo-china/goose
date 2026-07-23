import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizePrivateUploadMimeType } from "./private-upload-intent";

const INTENT_VERSION = "v1";
const INTENT_KEY_DERIVATION_LABEL =
  "gooes:wechat-pay-applyment-upload-intent:v1";

type ApplymentUploadIntentPayload = {
  scene: "wechat_pay_applyment";
  tenant_id: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  expires_at: number;
};

type ApplymentUploadIntentInput = {
  secretKey: string;
  scene: string;
  tenantId: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
};

export function createApplymentUploadIntent(
  input: ApplymentUploadIntentInput & { expiresAtSeconds: number },
) {
  const payload: ApplymentUploadIntentPayload = {
    scene: "wechat_pay_applyment",
    tenant_id: input.tenantId,
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

export function verifyApplymentUploadIntent(
  input: ApplymentUploadIntentInput & {
    token: string;
    nowSeconds: number;
  },
) {
  const parts = input.token.split(".");
  if (parts.length !== 3 || parts[0] !== INTENT_VERSION) return false;
  const encodedPayload = parts[1] ?? "";
  const encodedSignature = parts[2] ?? "";
  if (
    !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
    !/^[A-Za-z0-9_-]+$/.test(encodedSignature)
  ) return false;

  const expectedSignature = createHmac("sha256", deriveIntentKey(input.secretKey))
    .update(`${INTENT_VERSION}.${encodedPayload}`)
    .digest();
  const receivedSignature = Buffer.from(encodedSignature, "base64url");
  if (receivedSignature.length !== expectedSignature.length) return false;
  if (!timingSafeEqual(receivedSignature, expectedSignature)) return false;

  const payload = parsePayload(encodedPayload);
  return Boolean(
    payload &&
    payload.expires_at > input.nowSeconds &&
    payload.scene === input.scene &&
    payload.tenant_id === input.tenantId &&
    payload.object_key === input.objectKey &&
    payload.mime_type === normalizePrivateUploadMimeType(input.mimeType) &&
    payload.size_bytes === input.sizeBytes
  );
}

function deriveIntentKey(secretKey: string) {
  return createHmac("sha256", secretKey)
    .update(INTENT_KEY_DERIVATION_LABEL)
    .digest();
}

function parsePayload(encodedPayload: string): ApplymentUploadIntentPayload | null {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const payload = value as Record<string, unknown>;
    const keys = Object.keys(payload).sort();
    const expectedKeys = [
      "expires_at",
      "mime_type",
      "object_key",
      "scene",
      "size_bytes",
      "tenant_id",
    ];
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== expectedKeys[index]) ||
      payload.scene !== "wechat_pay_applyment" ||
      typeof payload.tenant_id !== "string" ||
      typeof payload.object_key !== "string" ||
      typeof payload.mime_type !== "string" ||
      !Number.isInteger(payload.size_bytes) ||
      !Number.isInteger(payload.expires_at)
    ) return null;
    return payload as ApplymentUploadIntentPayload;
  } catch {
    return null;
  }
}
