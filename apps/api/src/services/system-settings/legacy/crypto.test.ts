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

  test.each([
    "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  ])("strictly validates virtual payment secret bundle %s", (key) => {
    const paymentRecord = {
      ...record,
      key,
      value_type: "json" as const,
    };
    const boundaryAppKey = "a".repeat(512);
    const valid = JSON.stringify({ appKey: boundaryAppKey, revision: 2 });
    const oversizedAppKey = "sensitive-" + "b".repeat(503);

    expect(validateSettingValue(paymentRecord, valid)).toBe(valid);
    for (const invalid of [
      JSON.stringify({ appKey: "app-key", revision: 0 }),
      JSON.stringify({ appKey: "app-key", revision: 1.5 }),
      JSON.stringify({ appKey: "", revision: 2 }),
      JSON.stringify({ appKey: "app-key", revision: 2, extra: true }),
      JSON.stringify({ app_key: "app-key", revision: 2 }),
      JSON.stringify({ appKey: oversizedAppKey, revision: 2 }),
    ]) {
      const error = (() => {
        try {
          validateSettingValue(paymentRecord, invalid);
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toMatchObject({ message: "微信虚拟支付密钥包格式不正确" });
      expect(JSON.stringify(error)).not.toContain(oversizedAppKey);
    }
  });

  test("validates virtual-payment message token and Mini Program original ID", () => {
    const tokenRecord = {
      ...record,
      key: "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN",
      is_secret: true,
    };
    const originalIdRecord = {
      ...record,
      key: "WECHAT_MINIPROGRAM_ORIGINAL_ID",
      is_secret: false,
    };

    expect(validateSettingValue(tokenRecord, "message-token")).toBe("message-token");
    expect(validateSettingValue(originalIdRecord, "gh_97417a04a28d"))
      .toBe("gh_97417a04a28d");
    for (const invalid of [" ", "x".repeat(513)]) {
      expect(() => validateSettingValue(tokenRecord, invalid)).toThrow(
        "微信虚拟支付消息令牌格式不正确",
      );
    }
    for (const invalid of ["wx-appid", "gh_", "gh_bad/value"] ) {
      expect(() => validateSettingValue(originalIdRecord, invalid)).toThrow(
        "微信小程序原始 ID 格式不正确",
      );
    }
  });
});
