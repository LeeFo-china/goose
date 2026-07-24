import { describe, expect, test } from "bun:test";

import {
  decryptApplymentSensitivePayload,
  encryptApplymentSensitivePayload,
} from "./wechat-pay-applyment-sensitive-payload";

const payload = {
  identity_name: "张三",
  identity_number: "41000019900101001X",
  identity_address: "河南省信阳市固始县示例路1号",
  contact_name: "李四",
  contact_phone: "18800000000",
  contact_email: "finance@example.com",
  contact_identity_number: null,
  contact_identity_address: null,
  bank_account_name: "示例装饰有限公司",
  bank_account_number: "6222000000000000",
};

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  applymentId: "33333333-3333-4333-8333-333333333333",
  version: 1,
};

describe("WeChat Pay applyment sensitive payload", () => {
  test("encrypts and decrypts a partial draft payload", () => {
    const partialPayload = {
      identity_name: "张三",
      identity_number: "41000019900101001X",
    };
    const ciphertext = encryptApplymentSensitivePayload({
      context,
      payload: partialPayload,
      rootSecret: "test-root-secret",
    });

    expect(decryptApplymentSensitivePayload({
      context,
      ciphertext,
      rootSecret: "test-root-secret",
    })).toEqual(partialPayload);
  });

  test("reports missing complete payload fields by contact type", async () => {
    const sensitivePayloadModule = await import(
      "./wechat-pay-applyment-sensitive-payload"
    );
    const getMissingApplymentSensitiveFields = Reflect.get(
      sensitivePayloadModule,
      "getMissingApplymentSensitiveFields",
    );
    const requireCompleteApplymentSensitivePayload = Reflect.get(
      sensitivePayloadModule,
      "requireCompleteApplymentSensitivePayload",
    );
    expect(typeof getMissingApplymentSensitiveFields).toBe("function");
    expect(typeof requireCompleteApplymentSensitivePayload).toBe("function");
    if (
      typeof getMissingApplymentSensitiveFields !== "function" ||
      typeof requireCompleteApplymentSensitivePayload !== "function"
    ) return;

    expect(getMissingApplymentSensitiveFields({
      identity_name: "张三",
    }, "SUPER")).toEqual([
      "identity_number",
      "contact_name",
      "contact_phone",
      "contact_email",
      "bank_account_name",
      "bank_account_number",
      "contact_identity_number",
      "contact_identity_address",
    ]);
    expect(() =>
      requireCompleteApplymentSensitivePayload({
        identity_name: "张三",
      }, "LEGAL")
    ).toThrow(expect.objectContaining({
      code: "WECHAT_PAY_APPLYMENT_SENSITIVE_FIELDS_MISSING",
      details: {
        missing: expect.arrayContaining(["identity_number", "contact_phone"]),
      },
    }));
    expect(requireCompleteApplymentSensitivePayload(payload, "LEGAL"))
      .toEqual(payload);
  });

  test("round trips a purpose-bound encrypted payload", () => {
    const ciphertext = encryptApplymentSensitivePayload({
      context,
      payload,
      rootSecret: "test-root-secret",
    });

    expect(ciphertext).toStartWith("wpa:v1:");
    expect(ciphertext).not.toContain(payload.identity_number);
    expect(ciphertext).not.toContain(payload.bank_account_number);
    expect(
      decryptApplymentSensitivePayload({
        context,
        ciphertext,
        rootSecret: "test-root-secret",
      }),
    ).toEqual(payload);
  });

  test("rejects another tenant application context", () => {
    const ciphertext = encryptApplymentSensitivePayload({
      context,
      payload,
      rootSecret: "test-root-secret",
    });

    expect(() =>
      decryptApplymentSensitivePayload({
        context: { ...context, tenantId: "another-tenant" },
        ciphertext,
        rootSecret: "test-root-secret",
      })
    ).toThrow("微信支付进件敏感资料解密失败");
  });

  test("rejects a wrong root secret and malformed ciphertext", () => {
    const ciphertext = encryptApplymentSensitivePayload({
      context,
      payload,
      rootSecret: "test-root-secret",
    });

    expect(() =>
      decryptApplymentSensitivePayload({
        context,
        ciphertext,
        rootSecret: "wrong-root-secret",
      })
    ).toThrow("微信支付进件敏感资料解密失败");
    expect(() =>
      decryptApplymentSensitivePayload({
        context,
        ciphertext: "not-a-valid-ciphertext",
        rootSecret: "test-root-secret",
      })
    ).toThrow("微信支付进件敏感资料密文格式错误");
  });
});
