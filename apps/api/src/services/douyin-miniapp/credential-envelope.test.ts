import { describe, expect, test } from "bun:test";
import { createSecretKey } from "node:crypto";
import { AppError } from "@/errors/app-error";
import {
  openDouyinCredential,
  sealDouyinCredential,
  type DouyinCredentialKeyring,
} from "./credential-envelope";

const v1Key = createSecretKey(Buffer.alloc(32, 0x11));
const v2Key = createSecretKey(Buffer.alloc(32, 0x22));

const keyring: DouyinCredentialKeyring = {
  activeKeyVersion: "v2",
  keys: { v1: v1Key, v2: v2Key },
};

function expectAppError(action: () => unknown, code: string): AppError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(AppError);
  expect(caught).toMatchObject({ code });
  return caught as AppError;
}

describe("douyin credential envelope", () => {
  test("seals with the active version and opens the original credential", () => {
    const sealed = sealDouyinCredential("isvrft.secret", keyring);

    expect(sealed.keyVersion).toBe("v2");
    expect(sealed.ciphertext).not.toContain("isvrft.secret");
    expect(Buffer.from(sealed.iv, "base64")).toHaveLength(12);
    expect(openDouyinCredential(sealed, keyring)).toBe("isvrft.secret");
  });

  test("uses a fresh random IV for each envelope", () => {
    const first = sealDouyinCredential("isvrft.secret", keyring);
    const second = sealDouyinCredential("isvrft.secret", keyring);

    expect(first.iv).not.toBe(second.iv);
  });

  test("keeps key material independent from the mutable source buffer", () => {
    const source = Buffer.alloc(32, 0x44);
    const protectedKey = createSecretKey(source);
    source.fill(0);
    const protectedKeyring: DouyinCredentialKeyring = {
      activeKeyVersion: "v1",
      keys: { v1: protectedKey },
    };

    const sealed = sealDouyinCredential("protected.secret", protectedKeyring);

    expect(openDouyinCredential(sealed, protectedKeyring)).toBe("protected.secret");
  });

  test("decrypts an old-version envelope while the old key remains", () => {
    const oldKeyring: DouyinCredentialKeyring = {
      activeKeyVersion: "v1",
      keys: keyring.keys,
    };
    const sealed = sealDouyinCredential("old.refresh.secret", oldKeyring);

    expect(openDouyinCredential(sealed, keyring)).toBe("old.refresh.secret");
  });

  test("rejects an envelope whose key version is unavailable", () => {
    const sealed = sealDouyinCredential("isvrft.secret", keyring);

    expectAppError(
      () => openDouyinCredential({ ...sealed, keyVersion: "missing-version" }, keyring),
      "DOUYIN_CREDENTIAL_KEY_VERSION_MISSING",
    );
  });

  test("rejects sealing when the active key is unavailable", () => {
    expectAppError(
      () => sealDouyinCredential("isvrft.secret", {
        activeKeyVersion: "v3",
        keys: keyring.keys,
      }),
      "DOUYIN_CREDENTIAL_ACTIVE_KEY_MISSING",
    );
  });

  test("wraps encryption runtime failures without exposing their cause", () => {
    const error = expectAppError(
      () => sealDouyinCredential(Symbol("invalid-plaintext") as never, keyring),
      "DOUYIN_CREDENTIAL_ENCRYPT_FAILED",
    );

    expect(error.statusCode).toBe(500);
    expect(error.details).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  test("rejects a tampered authentication tag", () => {
    const sealed = sealDouyinCredential("isvrft.secret", keyring);
    const tag = Buffer.from(sealed.tag, "base64");
    tag[0] = (tag[0] ?? 0) ^ 0xff;

    expectAppError(
      () => openDouyinCredential({ ...sealed, tag: tag.toString("base64") }, keyring),
      "DOUYIN_CREDENTIAL_DECRYPT_FAILED",
    );
  });
});
