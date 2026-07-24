import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  createSupplierLicenseUploadIntent,
  hashSupplierLicenseEmployeeId,
  verifySupplierLicenseUploadIntent,
} from "./supplier-license-upload-intent";

const SECRET_KEY = "cos-secret-key";
const EMPLOYEE_ID = "platform-employee-1";
const EMPLOYEE_HASH = createHash("sha256").update(EMPLOYEE_ID).digest("hex");
const OBJECT_KEY = `private/supplier-business-license/employees/${EMPLOYEE_HASH}/`
  + "2026/07/24/license.jpg";

function createIntent(input: {
  scene?: string;
  employeeId?: string;
  objectKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  expiresAtSeconds?: number;
} = {}) {
  return createSupplierLicenseUploadIntent({
    secretKey: SECRET_KEY,
    scene: input.scene ?? "supplier_business_license",
    employeeId: input.employeeId ?? EMPLOYEE_ID,
    objectKey: input.objectKey ?? OBJECT_KEY,
    mimeType: input.mimeType ?? "image/jpeg",
    sizeBytes: input.sizeBytes ?? 100,
    expiresAtSeconds: input.expiresAtSeconds ?? Math.floor(Date.now() / 1000) + 600,
  });
}

function verify(token: string, input: {
  scene?: string;
  employeeId?: string;
  objectKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  nowSeconds?: number;
} = {}) {
  return verifySupplierLicenseUploadIntent({
    token,
    secretKey: SECRET_KEY,
    scene: input.scene ?? "supplier_business_license",
    employeeId: input.employeeId ?? EMPLOYEE_ID,
    objectKey: input.objectKey ?? OBJECT_KEY,
    mimeType: input.mimeType ?? "image/jpeg",
    sizeBytes: input.sizeBytes ?? 100,
    nowSeconds: input.nowSeconds ?? Math.floor(Date.now() / 1000),
  });
}

describe("supplier license upload intent", () => {
  test("hashes employee ids for private supplier object prefixes", () => {
    expect(hashSupplierLicenseEmployeeId(` ${EMPLOYEE_ID} `)).toBe(EMPLOYEE_HASH);
  });

  test("binds scene employee object key MIME size and expiry", () => {
    const token = createIntent();

    expect(verify(token)).toMatchObject({
      scene: "supplier_business_license",
      employeeHash: EMPLOYEE_HASH,
      objectKey: OBJECT_KEY,
      mimeType: "image/jpeg",
      sizeBytes: 100,
    });
  });

  test.each([
    ["scene", { scene: "wechat_pay_applyment" }],
    ["employee", { employeeId: "other-employee" }],
    ["object key", { objectKey: "private/supplier-business-license/employees/other/file.jpg" }],
    ["MIME", { mimeType: "image/png" }],
    ["size", { sizeBytes: 101 }],
  ])("rejects a token with a mismatched %s", (_name, overrides) => {
    const token = createIntent();

    expect(verify(token, overrides)).toBeNull();
  });

  test("rejects expired and tampered tokens", () => {
    const expired = createIntent({ expiresAtSeconds: 1 });
    const valid = createIntent();
    const parts = valid.split(".");
    const signature = parts[2] ?? "";
    const replacement = signature.startsWith("A") ? "B" : "A";
    const tampered = `${parts[0]}.${parts[1]}.${replacement}${signature.slice(1)}`;

    expect(verify(expired)).toBeNull();
    expect(verify(tampered)).toBeNull();
  });
});
