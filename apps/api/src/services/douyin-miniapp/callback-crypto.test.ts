import { describe, expect, test } from "bun:test";
import { createCipheriv, createHash } from "node:crypto";
import { AppError } from "@/errors/app-error";
import {
  decryptDouyinCallback,
  verifyDouyinCallbackSignature,
} from "./callback-crypto";

const AES_KEY = Buffer.alloc(32, 0x5a);
const ENCODING_AES_KEY = AES_KEY.toString("base64").slice(0, -1);
const IV = Buffer.from("0123456789abcdef", "utf8");
const RANDOM_PREFIX = Buffer.from("fedcba9876543210", "utf8");
const COMPONENT_APP_ID = "tt-component-1";
const TOKEN = "callback-token";
const TIMESTAMP = "1721376000";
const NONCE = "4464221";

type EncryptFixtureOptions = {
  messageBytes?: Buffer;
  componentAppIdBytes?: Buffer;
  declaredMessageLength?: number;
  invalidPadding?: boolean;
};

function sign(encrypted: string): string {
  return createHash("sha1")
    .update([TOKEN, TIMESTAMP, NONCE, encrypted].sort().join(""))
    .digest("hex");
}

function encryptFixture(options: EncryptFixtureOptions = {}) {
  const message = { InfoType: "component_ticket", ComponentVerifyTicket: "ticket-value" };
  const messageBytes = options.messageBytes ?? Buffer.from(JSON.stringify(message), "utf8");
  const componentAppIdBytes = options.componentAppIdBytes ?? Buffer.from(COMPONENT_APP_ID, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(options.declaredMessageLength ?? messageBytes.length);
  const plaintext = Buffer.concat([
    RANDOM_PREFIX,
    length,
    messageBytes,
    componentAppIdBytes,
  ]);
  const paddingLength = 32 - (plaintext.length % 32 || 32) || 32;
  const padding = Buffer.alloc(paddingLength, paddingLength);
  if (options.invalidPadding) {
    padding[0] = paddingLength === 1 ? 2 : paddingLength - 1;
  }
  const cipher = createCipheriv("aes-256-cbc", AES_KEY, IV);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([
    IV,
    cipher.update(Buffer.concat([plaintext, padding])),
    cipher.final(),
  ]).toString("base64");

  return {
    encrypted,
    encodingAesKey: ENCODING_AES_KEY,
    message,
    signature: sign(encrypted),
  };
}

function encryptOfficialJavaPhpFixture() {
  const message = { InfoType: "component_ticket", ComponentVerifyTicket: "ticket-value" };
  const messageBytes = Buffer.from(JSON.stringify(message), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBytes.length);
  const plaintext = Buffer.concat([
    Buffer.alloc(32, 0x31),
    length,
    messageBytes,
    Buffer.from(COMPONENT_APP_ID, "utf8"),
  ]);
  const paddingLength = 32 - (plaintext.length % 32 || 32) || 32;
  const padding = Buffer.alloc(paddingLength, paddingLength);
  const cipher = createCipheriv(
    "aes-256-cbc",
    AES_KEY,
    AES_KEY.subarray(0, 16),
  );
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, padding])),
    cipher.final(),
  ]).toString("base64");

  return {
    encrypted,
    encodingAesKey: ENCODING_AES_KEY,
    message,
  };
}

function expectAppError(action: () => unknown, code: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(AppError);
  expect(caught).toMatchObject({ code });
}

describe("douyin callback crypto", () => {
  test("verifies the official sorted SHA-1 signature and decrypts the message", () => {
    const fixture = encryptFixture();

    expect(verifyDouyinCallbackSignature({
      token: TOKEN,
      timestamp: TIMESTAMP,
      nonce: NONCE,
      encrypted: fixture.encrypted,
      signature: fixture.signature,
    })).toBe(true);
    expect(decryptDouyinCallback({
      encrypted: fixture.encrypted,
      encodingAesKey: fixture.encodingAesKey,
      expectedComponentAppId: COMPONENT_APP_ID,
    })).toEqual(fixture.message);
  });

  test("decrypts the full-ciphertext form used by the official Java and PHP demos", () => {
    const fixture = encryptOfficialJavaPhpFixture();

    expect(decryptDouyinCallback({
      encrypted: fixture.encrypted,
      encodingAesKey: fixture.encodingAesKey,
      expectedComponentAppId: COMPONENT_APP_ID,
    })).toEqual(fixture.message);
  });

  test.each([
    ["uppercase", (signature: string) => signature.toUpperCase()],
    ["non-hex", (signature: string) => `${signature.slice(0, -1)}g`],
    ["39-character", (signature: string) => signature.slice(0, -1)],
    ["41-character", (signature: string) => `${signature}0`],
  ])("rejects a %s signature", (_caseName, mutateSignature) => {
    const fixture = encryptFixture();

    expect(verifyDouyinCallbackSignature({
      token: TOKEN,
      timestamp: TIMESTAMP,
      nonce: NONCE,
      encrypted: fixture.encrypted,
      signature: mutateSignature(fixture.signature),
    })).toBe(false);
  });

  test("rejects non-canonical base64 ciphertext", () => {
    expectAppError(
      () => decryptDouyinCallback({
        encrypted: "not+strict/base64===junk",
        encodingAesKey: ENCODING_AES_KEY,
        expectedComponentAppId: COMPONENT_APP_ID,
      }),
      "DOUYIN_CALLBACK_CIPHERTEXT_INVALID",
    );
  });

  test("rejects invalid PKCS#7 padding bytes", () => {
    const fixture = encryptFixture({ invalidPadding: true });

    expectAppError(
      () => decryptDouyinCallback({
        encrypted: fixture.encrypted,
        encodingAesKey: fixture.encodingAesKey,
        expectedComponentAppId: COMPONENT_APP_ID,
      }),
      "DOUYIN_CALLBACK_PADDING_INVALID",
    );
  });

  test("rejects a message length that overflows the decrypted payload", () => {
    const fixture = encryptFixture({ declaredMessageLength: 0xffff_ffff });

    expectAppError(
      () => decryptDouyinCallback({
        encrypted: fixture.encrypted,
        encodingAesKey: fixture.encodingAesKey,
        expectedComponentAppId: COMPONENT_APP_ID,
      }),
      "DOUYIN_CALLBACK_LENGTH_INVALID",
    );
  });

  test("rejects invalid JSON", () => {
    const fixture = encryptFixture({ messageBytes: Buffer.from("not-json", "utf8") });

    expectAppError(
      () => decryptDouyinCallback({
        encrypted: fixture.encrypted,
        encodingAesKey: fixture.encodingAesKey,
        expectedComponentAppId: COMPONENT_APP_ID,
      }),
      "DOUYIN_CALLBACK_MESSAGE_INVALID",
    );
  });

  test("rejects invalid UTF-8 in the JSON message", () => {
    const fixture = encryptFixture({ messageBytes: Buffer.from([0x7b, 0xff, 0x7d]) });

    expectAppError(
      () => decryptDouyinCallback({
        encrypted: fixture.encrypted,
        encodingAesKey: fixture.encodingAesKey,
        expectedComponentAppId: COMPONENT_APP_ID,
      }),
      "DOUYIN_CALLBACK_MESSAGE_INVALID",
    );
  });

  test("rejects an empty decrypted component AppID", () => {
    const fixture = encryptFixture({ componentAppIdBytes: Buffer.alloc(0) });

    expectAppError(
      () => decryptDouyinCallback({
        encrypted: fixture.encrypted,
        encodingAesKey: fixture.encodingAesKey,
        expectedComponentAppId: COMPONENT_APP_ID,
      }),
      "DOUYIN_CALLBACK_COMPONENT_APP_ID_INVALID",
    );
  });

  test("rejects a mismatched decrypted component AppID", () => {
    const fixture = encryptFixture({ componentAppIdBytes: Buffer.from("tt-other-component", "utf8") });

    expectAppError(
      () => decryptDouyinCallback({
        encrypted: fixture.encrypted,
        encodingAesKey: fixture.encodingAesKey,
        expectedComponentAppId: COMPONENT_APP_ID,
      }),
      "DOUYIN_CALLBACK_COMPONENT_APP_ID_MISMATCH",
    );
  });
});
