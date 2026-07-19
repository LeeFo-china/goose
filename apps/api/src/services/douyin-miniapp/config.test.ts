import { describe, expect, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import { loadDouyinMiniappConfig } from "./config";

const keyV1 = Buffer.alloc(32, 0x31).toString("base64");
const keyV2 = Buffer.alloc(32, 0x32).toString("base64");

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

describe("douyin miniapp config", () => {
  test("loads all static configuration and decoded credential keys", () => {
    const config = loadDouyinMiniappConfig(validEnv());

    expect(config.componentAppId).toBe("tt-component-1");
    expect(config.templateAppId).toBe("tt-template-1");
    expect(config.credentialKeyring.activeKeyVersion).toBe("v2");
    expect(config.credentialKeyring.keys.v1).toEqual(Buffer.alloc(32, 0x31));
    expect(config.credentialKeyring.keys.v2).toEqual(Buffer.alloc(32, 0x32));
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
