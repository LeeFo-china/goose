import { createHmac, timingSafeEqual } from "node:crypto";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type {
  DirectUploadInput,
  RegisterExistingCosObjectInput,
} from "./shared";

const VERSION = "v1";
const KEY_LABEL = "gooes:supplier-purchase-receipt-upload-intent:v1";

type Claims = {
  scene: "supplier_purchase_receipt_delivery_note";
  tenant_id: string;
  employee_id: string;
  order_id: string;
  receipt_id: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  expires_at: number;
};

export function createSupplierPurchaseReceiptUploadIntent(
  input: DirectUploadInput,
  signing: { secretKey: string; objectKey: string; expiresAtSeconds: number },
) {
  const claims: Claims = {
    scene: "supplier_purchase_receipt_delivery_note",
    tenant_id: input.tenantId!,
    employee_id: input.employeeId!,
    order_id: input.supplierPurchaseOrderId!,
    receipt_id: input.businessId!,
    object_key: signing.objectKey,
    mime_type: input.mimetype,
    size_bytes: input.sizeBytes,
    expires_at: signing.expiresAtSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign(signing.secretKey, payload).toString("base64url");
  return `${VERSION}.${payload}.${signature}`;
}

export function assertValidSupplierPurchaseReceiptUploadIntent(
  input: RegisterExistingCosObjectInput,
  secretKey: string,
) {
  const [version, payload, signature, extra] =
    (input.uploadIntent?.trim() || "").split(".");
  if (version !== VERSION || !payload || !signature || extra) {
    throw invalidIntent();
  }
  const expected = sign(secretKey, payload);
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw invalidIntent();
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
    if (
      claims.scene !== input.scene ||
      claims.tenant_id !== input.tenantId ||
      claims.employee_id !== input.employeeId ||
      claims.order_id !== input.supplierPurchaseOrderId ||
      claims.receipt_id !== input.businessId ||
      claims.object_key !== input.objectKey ||
      claims.mime_type !== input.mimetype ||
      claims.size_bytes !== input.sizeBytes ||
      !Number.isInteger(claims.expires_at) ||
      claims.expires_at <= Math.floor(Date.now() / 1000)
    ) throw invalidIntent();
  } catch (error) {
    if (isHttpError(error)) throw error;
    throw invalidIntent();
  }
}

function sign(secretKey: string, payload: string) {
  const key = createHmac("sha256", secretKey).update(KEY_LABEL).digest();
  return createHmac("sha256", key).update(`${VERSION}.${payload}`).digest();
}

function invalidIntent() {
  return Errors.business(
    400,
    "送货单据上传凭证无效或已过期",
    ErrorCodes.FILE_STORAGE_UPLOAD_FAILED,
  );
}

function isHttpError(error: unknown): error is { statusCode: number } {
  return typeof error === "object" && error !== null &&
    "statusCode" in error;
}
