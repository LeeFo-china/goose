import { afterEach, describe, expect, test } from "bun:test";

import {
  decryptWechatMiniSessionKey,
  encryptWechatMiniSessionKey,
} from "./wechat-mini-session-crypto";

const ENV_NAME = "WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1";

describe("wechat mini session crypto", () => {
  afterEach(() => {
    delete process.env[ENV_NAME];
  });

  test("round-trips with AES-GCM without exposing plaintext", () => {
    process.env[ENV_NAME] = "test-key-material-not-used-in-production";

    const encrypted = encryptWechatMiniSessionKey("session-key", 1);

    expect(encrypted).toStartWith("wmss:v1:1:");
    expect(encrypted).not.toContain("session-key");
    expect(decryptWechatMiniSessionKey(encrypted, 1)).toBe("session-key");
  });

  test("rejects tampered ciphertext with the stable refresh-required error", () => {
    process.env[ENV_NAME] = "test-key-material-not-used-in-production";
    const encrypted = encryptWechatMiniSessionKey("session-key", 1);
    const envelope = encrypted.split(":");
    const authTag = Buffer.from(envelope[4]!, "base64url");
    authTag[0] = authTag[0]! ^ 1;
    envelope[4] = authTag.toString("base64url");
    const tampered = envelope.join(":");

    expect(() => decryptWechatMiniSessionKey(tampered, 1)).toThrowError(
      expect.objectContaining({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
      }),
    );
  });

  test("fails closed when the dedicated encryption key is missing", () => {
    expect(() => encryptWechatMiniSessionKey("session-key", 1)).toThrowError(
      expect.objectContaining({
        statusCode: 503,
        code: "WECHAT_MINI_SESSION_ENCRYPTION_KEY_MISSING",
      }),
    );
  });

  test("preserves the server configuration error when decrypting without a key", () => {
    process.env[ENV_NAME] = "test-key-material-not-used-in-production";
    const encrypted = encryptWechatMiniSessionKey("session-key", 1);
    delete process.env[ENV_NAME];

    expect(() => decryptWechatMiniSessionKey(encrypted, 1)).toThrowError(
      expect.objectContaining({
        statusCode: 503,
        code: "WECHAT_MINI_SESSION_ENCRYPTION_KEY_MISSING",
      }),
    );
  });

  test("rejects envelopes with appended fields", () => {
    process.env[ENV_NAME] = "test-key-material-not-used-in-production";
    const encrypted = encryptWechatMiniSessionKey("session-key", 1);

    expect(() => decryptWechatMiniSessionKey(`${encrypted}:extra`, 1))
      .toThrowError(expect.objectContaining({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
      }));
  });
});
