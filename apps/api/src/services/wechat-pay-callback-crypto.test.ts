import { describe, expect, test } from "bun:test";
import {
  createCipheriv,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import {
  decryptWechatPayResource,
  verifyWechatPayCallbackSignature,
} from "./wechat-pay-callback-crypto";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

describe("wechat pay callback crypto", () => {
  test("verifies callback signature with raw body", () => {
    const timestamp = "1782873600";
    const nonce = "callback-nonce";
    const rawBody = JSON.stringify({ id: "notify-1" });
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`),
      privateKey,
    ).toString("base64");

    const verified = verifyWechatPayCallbackSignature({
      timestamp,
      nonce,
      rawBody,
      signature,
      publicKeyPem: publicKey,
    });

    expect(verified).toBe(true);
  });

  test("rejects callback signature when body changes", () => {
    const timestamp = "1782873600";
    const nonce = "callback-nonce";
    const rawBody = JSON.stringify({ id: "notify-1" });
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`),
      privateKey,
    ).toString("base64");

    const verified = verifyWechatPayCallbackSignature({
      timestamp,
      nonce,
      rawBody: JSON.stringify({ id: "notify-2" }),
      signature,
      publicKeyPem: publicKey,
    });

    expect(verified).toBe(false);
  });

  test("decrypts AES-256-GCM resource with api v3 key", () => {
    const apiV3Key = "12345678901234567890123456789012";
    const nonce = "resource-iv";
    const associatedData = "transaction";
    const plaintext = JSON.stringify({
      out_trade_no: "WX202607010001",
      transaction_id: "4200000000202607010000000001",
      trade_state: "SUCCESS",
    });
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(apiV3Key),
      Buffer.from(nonce),
    );
    cipher.setAAD(Buffer.from(associatedData));
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]);

    const decrypted = decryptWechatPayResource({
      apiV3Key,
      nonce,
      associatedData,
      ciphertext: encrypted.toString("base64"),
    });

    expect(decrypted).toEqual(JSON.parse(plaintext));
  });

  test("rejects resource decrypt with a wrong api v3 key", () => {
    const apiV3Key = "12345678901234567890123456789012";
    const nonce = "resource-iv";
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(apiV3Key),
      Buffer.from(nonce),
    );
    const encrypted = Buffer.concat([
      cipher.update("{}", "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]);

    expect(() =>
      decryptWechatPayResource({
        apiV3Key: randomBytes(32).toString("hex").slice(0, 32),
        nonce,
        associatedData: "",
        ciphertext: encrypted.toString("base64"),
      })
    ).toThrow();
  });
});
