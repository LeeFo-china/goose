import { describe, expect, test } from "bun:test";

import {
  assertValidSupplierPurchaseReceiptUploadIntent,
  createSupplierPurchaseReceiptUploadIntent,
} from "./supplier-purchase-receipt-upload-intent";

const base = {
  scene: "supplier_purchase_receipt_delivery_note" as const,
  tenantId: "71000000-0000-4000-8000-000000000001",
  employeeId: "71000000-0000-4000-8000-000000000002",
  supplierPurchaseOrderId: "71000000-0000-4000-8000-000000000003",
  businessId: "71000000-0000-4000-8000-000000000004",
  mimetype: "image/jpeg",
  sizeBytes: 1024,
  visibility: "private" as const,
  objectKey: "tenants/71000000-0000-4000-8000-000000000001/supplier-purchase-receipt-delivery-note/receipts/71000000-0000-4000-8000-000000000004/2026/09/16/71000000-0000-4000-8000-000000000005.jpg",
};

describe("supplier purchase receipt upload intent", () => {
  test("binds tenant employee order receipt object type and size", () => {
    const secretKey = "receipt-upload-secret";
    const token = createSupplierPurchaseReceiptUploadIntent(base as never, {
      secretKey,
      objectKey: base.objectKey,
      expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
    });
    expect(() => assertValidSupplierPurchaseReceiptUploadIntent({
      ...base,
      uploadIntent: token,
    }, secretKey)).not.toThrow();
    expect(() => assertValidSupplierPurchaseReceiptUploadIntent({
      ...base,
      supplierPurchaseOrderId: "71000000-0000-4000-8000-000000000099",
      uploadIntent: token,
    }, secretKey)).toThrow(expect.objectContaining({
      statusCode: 400,
      code: "FILE_STORAGE_UPLOAD_FAILED",
    }));
  });
});
