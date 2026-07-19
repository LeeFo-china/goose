import { describe, expect, test } from "bun:test";
import { createSecretKey } from "node:crypto";
import { AppError } from "@/errors/app-error";
import { loadDouyinMiniappConfig } from "./config";

const keyV1 = Buffer.alloc(32, 0x31).toString("base64");
const keyV2 = Buffer.alloc(32, 0x32).toString("base64");
const MAX_CREDENTIAL_KEY_VERSIONS = 16;
const MAX_CREDENTIAL_KEYS_JSON_BYTES = 16 * 1024;

function credentialKeys(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`v${index + 1}`, keyV1]),
  );
}

function validEnv(): Record<string, string> {
  return {
    DOUYIN_COMPONENT_APP_ID: "tt-component-1",
    DOUYIN_COMPONENT_APP_SECRET: "component-app-secret",
    DOUYIN_COMPONENT_MESSAGE_TOKEN: "component-message-token",
    DOUYIN_COMPONENT_MESSAGE_AES_KEY: Buffer.alloc(32, 0x41).toString("base64").slice(0, -1),
    DOUYIN_TEMPLATE_APP_ID: "tt-template-1",
    DOUYIN_TEMPLATE_APP_SECRET: "template-app-secret",
    DOUYIN_CREDENTIAL_KEYS_JSON: JSON.stringify({ v1: keyV1, v2: keyV2 }),
    DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION: "v2",
    DOUYIN_SUBJECT_HASH_KEY: "subject-hash-key-material-32-bytes",
  };
}

function captureAppError(action: () => unknown): AppError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(AppError);
  expect(caught).toMatchObject({ code: "DOUYIN_CONFIG_INVALID", statusCode: 503 });
  return caught as AppError;
}

function expectConfigErrorWithoutValues(
  env: Record<string, string>,
  values: readonly string[],
): void {
  const error = captureAppError(() => loadDouyinMiniappConfig(env));
  const details = JSON.stringify(error.details);
  for (const value of values) {
    expect(error.message).not.toContain(value);
    expect(details).not.toContain(value);
  }
}

describe("douyin miniapp config", () => {
  test("loads all static configuration and decoded credential keys", () => {
    const config = loadDouyinMiniappConfig(validEnv());

    expect(config.componentAppId).toBe("tt-component-1");
    expect(config.templateAppId).toBe("tt-template-1");
    expect(config.credentialKeyring.activeKeyVersion).toBe("v2");
    expect(Buffer.isBuffer(config.credentialKeyring.keys.v1)).toBe(false);
    expect(config.credentialKeyring.keys.v1).toMatchObject({
      type: "secret",
      symmetricKeySize: 32,
    });
    expect(config.credentialKeyring.keys.v1?.equals(
      createSecretKey(Buffer.alloc(32, 0x31)),
    )).toBe(true);
    expect(config.credentialKeyring.keys.v2?.equals(
      createSecretKey(Buffer.alloc(32, 0x32)),
    )).toBe(true);
  });

  test("rejects credential keys JSON that is not an object", () => {
    const env = validEnv();
    env.DOUYIN_CREDENTIAL_KEYS_JSON = JSON.stringify([keyV1]);

    captureAppError(() => loadDouyinMiniappConfig(env));
  });

  test("strictly rejects malformed base64 credential keys", () => {
    const env = validEnv();
    const malformedKey = `${keyV1.slice(0, -2)}!!`;
    env.DOUYIN_CREDENTIAL_KEYS_JSON = JSON.stringify({ v1: malformedKey });
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "v1";

    const error = captureAppError(() => loadDouyinMiniappConfig(env));
    expect(error.message).not.toContain(malformedKey);
  });

  test("rejects decoded credential keys that are not 32 bytes", () => {
    const env = validEnv();
    env.DOUYIN_CREDENTIAL_KEYS_JSON = JSON.stringify({ short: Buffer.alloc(31).toString("base64") });
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "short";

    captureAppError(() => loadDouyinMiniappConfig(env));
  });

  test("rejects an active credential version absent from the key object", () => {
    const env = validEnv();
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "v3";

    captureAppError(() => loadDouyinMiniappConfig(env));
  });

  test("does not accept an inherited object property as the active key version", () => {
    const env = validEnv();
    env.DOUYIN_CREDENTIAL_KEYS_JSON = JSON.stringify({ v1: keyV1 });
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "toString";

    captureAppError(() => loadDouyinMiniappConfig(env));
  });

  test("rejects duplicate decoded credential key versions", () => {
    const env = validEnv();
    const duplicateJson = `{"v1":"${keyV1}","v1":"${keyV2}"}`;
    env.DOUYIN_CREDENTIAL_KEYS_JSON = duplicateJson;
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "v1";

    expectConfigErrorWithoutValues(env, [duplicateJson, keyV1, keyV2]);
  });

  test("rejects duplicate versions after JSON string escape decoding", () => {
    const env = validEnv();
    const escapedDuplicateJson = `{"v\\u0031":"${keyV1}","v1":"${keyV2}"}`;
    env.DOUYIN_CREDENTIAL_KEYS_JSON = escapedDuplicateJson;
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "v1";

    expectConfigErrorWithoutValues(env, [escapedDuplicateJson, keyV1, keyV2]);
  });

  test.each(["__proto__", "constructor", "prototype"])(
    "rejects reserved credential key version %s without silently dropping it",
    (reservedVersion) => {
      const env = validEnv();
      const reservedJson = `{"v1":"${keyV1}","${reservedVersion}":"${keyV2}"}`;
      env.DOUYIN_CREDENTIAL_KEYS_JSON = reservedJson;
      env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "v1";

      expectConfigErrorWithoutValues(env, [reservedJson, keyV1, keyV2]);
    },
  );

  test("accepts a safe 64-character credential key version", () => {
    const env = validEnv();
    const version = `v${"a".repeat(63)}`;
    env.DOUYIN_CREDENTIAL_KEYS_JSON = JSON.stringify({ [version]: keyV1 });
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = version;

    const config = loadDouyinMiniappConfig(env);

    expect(version).toHaveLength(64);
    expect(config.credentialKeyring.activeKeyVersion).toBe(version);
    expect(Object.hasOwn(config.credentialKeyring.keys, version)).toBe(true);
  });

  test("rejects a 65-character credential key version", () => {
    const env = validEnv();
    const version = `v${"a".repeat(64)}`;
    const rawJson = JSON.stringify({ [version]: keyV1 });
    env.DOUYIN_CREDENTIAL_KEYS_JSON = rawJson;
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = version;

    expect(version).toHaveLength(65);
    expectConfigErrorWithoutValues(env, [version, rawJson, keyV1]);
  });

  test("accepts the maximum of 16 credential key versions", () => {
    const env = validEnv();
    env.DOUYIN_CREDENTIAL_KEYS_JSON = JSON.stringify(
      credentialKeys(MAX_CREDENTIAL_KEY_VERSIONS),
    );
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "v16";

    const config = loadDouyinMiniappConfig(env);

    expect(Object.keys(config.credentialKeyring.keys)).toHaveLength(16);
  });

  test("rejects 17 credential key versions without echoing the keyring", () => {
    const env = validEnv();
    const oversizedKeyring = JSON.stringify(
      credentialKeys(MAX_CREDENTIAL_KEY_VERSIONS + 1),
    );
    env.DOUYIN_CREDENTIAL_KEYS_JSON = oversizedKeyring;
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "v17";

    const error = captureAppError(() => loadDouyinMiniappConfig(env));

    expect(error.message).not.toContain(oversizedKeyring);
    expect(JSON.stringify(error.details)).not.toContain(oversizedKeyring);
  });

  test("rejects credential keys JSON over 16 KiB before parsing", () => {
    const env = validEnv();
    const oversizedJson = `${JSON.stringify({ v1: keyV1 })}${" ".repeat(
      MAX_CREDENTIAL_KEYS_JSON_BYTES,
    )}`;
    env.DOUYIN_CREDENTIAL_KEYS_JSON = oversizedJson;
    env.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION = "v1";

    expect(Buffer.byteLength(oversizedJson, "utf8")).toBeGreaterThan(
      MAX_CREDENTIAL_KEYS_JSON_BYTES,
    );
    const error = captureAppError(() => loadDouyinMiniappConfig(env));
    expect(error.message).not.toContain(oversizedJson);
    expect(JSON.stringify(error.details)).not.toContain(oversizedJson);
  });

  test("rejects missing or unreasonably long static values without echoing secrets", () => {
    const env = validEnv();
    const oversizedSecret = "s".repeat(513);
    delete env.DOUYIN_COMPONENT_MESSAGE_TOKEN;
    env.DOUYIN_COMPONENT_APP_SECRET = oversizedSecret;

    const error = captureAppError(() => loadDouyinMiniappConfig(env));
    expect(error.message).not.toContain(oversizedSecret);
    expect(JSON.stringify(error.details)).not.toContain(oversizedSecret);
  });

  test("rejects a message AES key that does not decode to 32 bytes", () => {
    const env = validEnv();
    env.DOUYIN_COMPONENT_MESSAGE_AES_KEY = Buffer.alloc(31).toString("base64").replace(/=+$/, "");

    captureAppError(() => loadDouyinMiniappConfig(env));
  });
});
