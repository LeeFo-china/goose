import { generateKeyPairSync } from "node:crypto";

import { describe, expect, test } from "bun:test";

import type { SystemSettingRecord } from "./shared";
import { validateSettingValue } from "./crypto";

const record: SystemSettingRecord = {
  id: "setting-1",
  tenant_id: null,
  key: "TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM",
  group_code: "ocr",
  name: "身份证识别加密公钥",
  description: null,
  value_type: "string",
  value_text: null,
  is_secret: true,
  status: "active",
  updated_by_employee_id: null,
  created_at: "2026-07-22T00:00:00.000Z",
  updated_at: "2026-07-22T00:00:00.000Z",
};

const validPublicKey = generateKeyPairSync("rsa", {
  modulusLength: 1024,
}).publicKey.export({ type: "pkcs1", format: "pem" }).toString();

describe("system setting value validation", () => {
  test("accepts a valid Tencent OCR public key and allows clearing it", () => {
    expect(validateSettingValue(record, validPublicKey)).toBe(validPublicKey);
    expect(validateSettingValue(record, null)).toBeNull();
  });

  test("rejects malformed or outer-Base64 Tencent OCR public keys", () => {
    expect(() => validateSettingValue(record, "not-a-public-key"))
      .toThrow("身份证识别加密公钥必须是腾讯OCR提供的1024位PKCS#1 RSA公钥PEM");
    expect(() => validateSettingValue(
      record,
      Buffer.from(validPublicKey).toString("base64"),
    )).toThrow("身份证识别加密公钥必须是腾讯OCR提供的1024位PKCS#1 RSA公钥PEM");
  });
});
