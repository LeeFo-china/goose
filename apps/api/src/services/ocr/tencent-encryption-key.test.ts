import { generateKeyPairSync } from "node:crypto";

import { describe, expect, test } from "bun:test";

const keyModulePromise = import("./tencent-encryption-key");

function generatePublicKey(modulusLength: number, type: "pkcs1" | "spki") {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength });
  return publicKey.export({ type, format: "pem" }).toString();
}

describe("Tencent OCR encrypted ID public key", () => {
  test("accepts the documented 1024-bit PKCS#1 RSA public key PEM", async () => {
    const { isTencentOcrEncryptionPublicKeyPem } = await keyModulePromise;

    expect(isTencentOcrEncryptionPublicKeyPem(generatePublicKey(1024, "pkcs1")))
      .toBe(true);
  });

  test("rejects an outer Base64 wrapper until the operator decodes it", async () => {
    const { isTencentOcrEncryptionPublicKeyPem } = await keyModulePromise;
    const publicKey = generatePublicKey(1024, "pkcs1");

    expect(isTencentOcrEncryptionPublicKeyPem(Buffer.from(publicKey).toString("base64")))
      .toBe(false);
  });

  test("rejects PKCS#8/SPKI, wrong modulus size and malformed values", async () => {
    const { isTencentOcrEncryptionPublicKeyPem } = await keyModulePromise;

    expect(isTencentOcrEncryptionPublicKeyPem(generatePublicKey(1024, "spki")))
      .toBe(false);
    expect(isTencentOcrEncryptionPublicKeyPem(generatePublicKey(2048, "pkcs1")))
      .toBe(false);
    expect(isTencentOcrEncryptionPublicKeyPem("not-a-public-key"))
      .toBe(false);
  });
});
