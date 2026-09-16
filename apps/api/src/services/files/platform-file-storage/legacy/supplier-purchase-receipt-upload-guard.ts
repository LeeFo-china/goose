import { ErrorCodes, Errors } from "./shared";
import type { DirectUploadInput, RegisterExistingCosObjectInput } from "./shared";
import { getSupplierPurchaseReceiptDeliveryNoteUploadPolicy } from
  "./direct-upload-scene-policy";
import { assertValidSupplierPurchaseReceiptUploadIntent } from
  "./supplier-purchase-receipt-upload-intent";

export const SUPPLIER_PURCHASE_RECEIPT_DELIVERY_NOTE_SCENE =
  "supplier_purchase_receipt_delivery_note";

export function getSupplierPurchaseReceiptDeliveryNotePrivatePolicy(
  input: Pick<DirectUploadInput, "scene" | "visibility">,
) {
  return input.visibility === "private"
    ? getSupplierPurchaseReceiptDeliveryNoteUploadPolicy(input.scene)
    : null;
}

export function isPrivateSupplierPurchaseReceiptDeliveryNote(
  input: Pick<DirectUploadInput, "scene" | "visibility">,
) {
  return input.scene === SUPPLIER_PURCHASE_RECEIPT_DELIVERY_NOTE_SCENE &&
    input.visibility === "private";
}

export function assertSupplierPurchaseReceiptDirectUpload(
  input: DirectUploadInput,
) {
  if (input.scene !== SUPPLIER_PURCHASE_RECEIPT_DELIVERY_NOTE_SCENE) return;
  const policy = getSupplierPurchaseReceiptDeliveryNotePrivatePolicy(input);
  if (
    !policy || !input.tenantId || !input.employeeId || !input.businessId ||
    !input.supplierPurchaseOrderId || !policy.mimeTypes.has(input.mimetype) ||
    !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 ||
    input.sizeBytes > policy.maxSizeBytes
  ) {
    throw Errors.business(400, "送货单据上传声明无效", ErrorCodes.FILE_STORAGE_UPLOAD_FAILED);
  }
}

export function assertSupplierPurchaseReceiptCompletion(
  input: RegisterExistingCosObjectInput,
  secretKey: string,
) {
  if (input.scene !== SUPPLIER_PURCHASE_RECEIPT_DELIVERY_NOTE_SCENE) return;
  if (
    !isPrivateSupplierPurchaseReceiptDeliveryNote(input) ||
    !input.tenantId || !input.employeeId || !input.businessId ||
    !input.supplierPurchaseOrderId
  ) throw Errors.forbidden();
  assertValidSupplierPurchaseReceiptUploadIntent(input, secretKey);
}
