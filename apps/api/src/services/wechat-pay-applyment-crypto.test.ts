import { describe, expect, test } from "bun:test";
import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
} from "node:crypto";

import { encryptWechatPaySensitiveField } from "./wechat-pay-applyment-crypto";

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

describe("encryptWechatPaySensitiveField", () => {
  test("uses RSAES-OAEP SHA-1 required by WeChat Pay", () => {
    const encrypted = encryptWechatPaySensitiveField(
      "18800000000",
      keys.publicKey,
    );

    const plaintext = privateDecrypt(
      {
        key: keys.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      Buffer.from(encrypted, "base64"),
    ).toString("utf8");

    expect(plaintext).toBe("18800000000");
  });

  test("wraps an invalid WeChat Pay public key without leaking input", () => {
    const plaintext = "41000019900101001X";

    expect(() => encryptWechatPaySensitiveField(plaintext, "invalid-key"))
      .toThrowError(expect.objectContaining({
        statusCode: 409,
        code: "WECHAT_PAY_APPLYMENT_PUBLIC_KEY_INVALID",
      }));

    try {
      encryptWechatPaySensitiveField(plaintext, "invalid-key");
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(plaintext);
    }
  });
});
