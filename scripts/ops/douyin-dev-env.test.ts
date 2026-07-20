import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  DOUYIN_ENV_KEYS,
  DouyinDevEnvError,
  runDouyinDevEnvCli,
  validateDouyinDevEnvPayload,
  type DouyinEnvKey,
} from "./douyin-dev-env";

const COMPONENT_APP_ID = "tt-component-abc123";
const COMPONENT_SECRET = "component-secret-sentinel";
const MESSAGE_TOKEN = "0123456789abcdef0123456789abcdef";
const MESSAGE_AES_KEY = Buffer.alloc(32, 0x41)
  .toString("base64")
  .replace(/=+$/, "");
const TEMPLATE_APP_ID = "tt-template-xyz789";
const TEMPLATE_SECRET = "template-secret-sentinel";
const CREDENTIAL_KEY = Buffer.alloc(32, 0x42).toString("base64");
const CREDENTIAL_KEYS_JSON = JSON.stringify({ v1: CREDENTIAL_KEY });
const SUBJECT_HASH_KEY = "c".repeat(64);

const VALID_VALUES: Readonly<Record<DouyinEnvKey, string>> = {
  DOUYIN_COMPONENT_APP_ID: COMPONENT_APP_ID,
  DOUYIN_COMPONENT_APP_SECRET: COMPONENT_SECRET,
  DOUYIN_COMPONENT_MESSAGE_TOKEN: MESSAGE_TOKEN,
  DOUYIN_COMPONENT_MESSAGE_AES_KEY: MESSAGE_AES_KEY,
  DOUYIN_TEMPLATE_APP_ID: TEMPLATE_APP_ID,
  DOUYIN_TEMPLATE_APP_SECRET: TEMPLATE_SECRET,
  DOUYIN_CREDENTIAL_KEYS_JSON: CREDENTIAL_KEYS_JSON,
  DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION: "v1",
  DOUYIN_SUBJECT_HASH_KEY: SUBJECT_HASH_KEY,
};

const EXPECTED_METADATA = {
  environment: "development",
  nineKeysValid: true,
  componentAppIdTail: "abc123",
  componentAppIdShort: false,
  templateAppIdTail: "xyz789",
  templateAppIdShort: false,
  activeKeyVersion: "v1",
} as const;

const EXPECTED_METADATA_KEYS: string[] = [
  "environment",
  "nineKeysValid",
  "componentAppIdTail",
  "componentAppIdShort",
  "templateAppIdTail",
  "templateAppIdShort",
  "activeKeyVersion",
];

const SCRIPT_PATH = fileURLToPath(new URL("./douyin-dev-env.ts", import.meta.url));
const API_DIRECTORY = fileURLToPath(new URL("../../apps/api/", import.meta.url));
const textEncoder = new TextEncoder();

type ExpectedValidationCode =
  | "DOUYIN_DEV_ENV_PAYLOAD_INVALID"
  | "DOUYIN_DEV_ENV_INPUT_INVALID"
  | "DOUYIN_DEV_ENV_CONFIG_INVALID";

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface InvalidValueCase {
  readonly name: string;
  readonly key: DouyinEnvKey;
  readonly value: string;
  readonly code: ExpectedValidationCode;
}

function buildPayload(
  overrides: Readonly<Partial<Record<DouyinEnvKey, string>>> = {},
): string {
  return `${DOUYIN_ENV_KEYS.map(
    (key) => `${key}=${overrides[key] ?? VALID_VALUES[key]}`,
  ).join("\n")}\n`;
}

function overrideValue(
  key: DouyinEnvKey,
  value: string,
): Readonly<Partial<Record<DouyinEnvKey, string>>> {
  return { [key]: value };
}

function payloadLines(payload = buildPayload()): string[] {
  return payload.slice(0, -1).split("\n");
}

function captureValidationError(
  payload: string,
  expectedCode: ExpectedValidationCode,
  forbiddenValues: readonly string[] = [],
): DouyinDevEnvError {
  return captureRawValidationError(
    textEncoder.encode(payload),
    expectedCode,
    forbiddenValues,
  );
}

function captureRawValidationError(
  payload: Uint8Array,
  expectedCode: ExpectedValidationCode,
  forbiddenValues: readonly string[] = [],
): DouyinDevEnvError {
  let caught: unknown;

  try {
    validateDouyinDevEnvPayload(payload);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(DouyinDevEnvError);
  const douyinError = caught as DouyinDevEnvError;
  expect(douyinError.code).toBe(expectedCode);
  expect(douyinError.message).toBe(expectedCode);
  expect(Object.keys(douyinError)).toEqual(["code"]);

  const exposedError = [
    douyinError.message,
    douyinError.stack ?? "",
    JSON.stringify(douyinError),
  ].join("\n");
  for (const value of forbiddenValues.filter(Boolean)) {
    expect(exposedError).not.toContain(value);
  }

  return douyinError;
}

function runCli(args: readonly string[]): CliResult {
  const result = Bun.spawnSync({
    cmd: [process.execPath, SCRIPT_PATH, ...args],
    cwd: API_DIRECTORY,
    env: {
      DOUYIN_COMPONENT_APP_ID: "ambient-component-id-must-not-be-used",
      DOUYIN_COMPONENT_APP_SECRET: "ambient-component-secret-must-not-be-used",
      DOUYIN_TEMPLATE_APP_ID: "ambient-template-id-must-not-be-used",
      DOUYIN_TEMPLATE_APP_SECRET: "ambient-template-secret-must-not-be-used",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("douyin development environment payload", () => {
  let temporaryRoot = "";

  beforeEach(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "gooes-douyin-dev-env-"));
  });

  afterEach(() => {
    const rootToRemove = temporaryRoot;
    rmSync(rootToRemove, { recursive: true, force: true });
    expect(existsSync(rootToRemove)).toBe(false);
  });

  test("exports the exact ordered nine-key contract", () => {
    expect(DOUYIN_ENV_KEYS).toEqual([
      "DOUYIN_COMPONENT_APP_ID",
      "DOUYIN_COMPONENT_APP_SECRET",
      "DOUYIN_COMPONENT_MESSAGE_TOKEN",
      "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      "DOUYIN_TEMPLATE_APP_ID",
      "DOUYIN_TEMPLATE_APP_SECRET",
      "DOUYIN_CREDENTIAL_KEYS_JSON",
      "DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION",
      "DOUYIN_SUBJECT_HASH_KEY",
    ]);
    expect(typeof runDouyinDevEnvCli).toBe("function");
  });

  test("returns only redacted metadata for the exact LF-terminated payload", () => {
    const metadata = validateDouyinDevEnvPayload(
      textEncoder.encode(buildPayload()),
    );

    expect(metadata).toEqual(EXPECTED_METADATA);
    expect(Object.keys(metadata)).toEqual(EXPECTED_METADATA_KEYS);

    const serialized = JSON.stringify(metadata);
    for (const forbidden of [
      COMPONENT_SECRET,
      TEMPLATE_SECRET,
      MESSAGE_TOKEN,
      MESSAGE_AES_KEY,
      CREDENTIAL_KEY,
      CREDENTIAL_KEYS_JSON,
      SUBJECT_HASH_KEY,
      COMPONENT_APP_ID,
      TEMPLATE_APP_ID,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("does not expose any part of AppIDs shorter than seven characters", () => {
    const shortComponentId = "p9q8r7";
    const shortTemplateId = "m6n5b4";
    const metadata = validateDouyinDevEnvPayload(textEncoder.encode(buildPayload({
      DOUYIN_COMPONENT_APP_ID: shortComponentId,
      DOUYIN_TEMPLATE_APP_ID: shortTemplateId,
    })));

    expect(metadata).toEqual({
      ...EXPECTED_METADATA,
      componentAppIdTail: null,
      componentAppIdShort: true,
      templateAppIdTail: null,
      templateAppIdShort: true,
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain(shortComponentId);
    expect(serialized).not.toContain(shortTemplateId);
  });

  const validPayload = buildPayload();
  const framingCases: ReadonlyArray<readonly [string, string]> = [
    ["empty input", ""],
    ["missing line", `${payloadLines().slice(0, -1).join("\n")}\n`],
    [
      "duplicate key at a fixed position",
      (() => {
        const lines = payloadLines();
        lines[1] = lines[0] ?? "";
        return `${lines.join("\n")}\n`;
      })(),
    ],
    [
      "unknown key",
      (() => {
        const lines = payloadLines();
        lines[3] = "DOUYIN_UNKNOWN_KEY=value";
        return `${lines.join("\n")}\n`;
      })(),
    ],
    [
      "empty value",
      buildPayload({ DOUYIN_COMPONENT_APP_SECRET: "" }),
    ],
    [
      "wrong key order",
      (() => {
        const lines = payloadLines();
        const first = lines[0] ?? "";
        lines[0] = lines[1] ?? "";
        lines[1] = first;
        return `${lines.join("\n")}\n`;
      })(),
    ],
    ["carriage return", validPayload.replace("\n", "\r\n")],
    ["NUL byte", validPayload.replace("=", "=\0")],
    ["missing final LF", validPayload.slice(0, -1)],
    ["extra blank line", `${validPayload}\n`],
    ["extra content", `${validPayload}unexpected-content\n`],
  ];

  test.each(framingCases)(
    "rejects invalid payload framing: %s",
    (_name, payload) => {
      captureValidationError(
        payload,
        "DOUYIN_DEV_ENV_PAYLOAD_INVALID",
        [COMPONENT_SECRET, TEMPLATE_SECRET],
      );
    },
  );

  test("rejects a leading UTF-8 BOM before decoding payload records", () => {
    const payloadWithBom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(validPayload, "utf8"),
    ]);

    captureRawValidationError(
      payloadWithBom,
      "DOUYIN_DEV_ENV_PAYLOAD_INVALID",
      [COMPONENT_SECRET, TEMPLATE_SECRET],
    );
  });

  test("rejects malformed UTF-8 bytes", () => {
    const malformedPayload = Buffer.concat([
      Buffer.from([0xff]),
      Buffer.from(validPayload, "utf8"),
    ]);

    captureRawValidationError(
      malformedPayload,
      "DOUYIN_DEV_ENV_PAYLOAD_INVALID",
      [COMPONENT_SECRET, TEMPLATE_SECRET],
    );
  });

  const invalidValueCases: InvalidValueCase[] = [
    {
      name: "leading console whitespace",
      key: "DOUYIN_COMPONENT_APP_ID",
      value: ` ${COMPONENT_APP_ID}`,
      code: "DOUYIN_DEV_ENV_INPUT_INVALID",
    },
    {
      name: "trailing console whitespace",
      key: "DOUYIN_TEMPLATE_APP_SECRET",
      value: `${TEMPLATE_SECRET} `,
      code: "DOUYIN_DEV_ENV_INPUT_INVALID",
    },
    {
      name: "unsafe dollar sign in a console value",
      key: "DOUYIN_COMPONENT_APP_SECRET",
      value: "component$secret$must$stay$redacted",
      code: "DOUYIN_DEV_ENV_INPUT_INVALID",
    },
    {
      name: "component AppID over 128 characters",
      key: "DOUYIN_COMPONENT_APP_ID",
      value: "i".repeat(129),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "template AppID over 128 characters",
      key: "DOUYIN_TEMPLATE_APP_ID",
      value: "j".repeat(129),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "component secret over 512 characters",
      key: "DOUYIN_COMPONENT_APP_SECRET",
      value: "k".repeat(513),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "template secret over 512 characters",
      key: "DOUYIN_TEMPLATE_APP_SECRET",
      value: "l".repeat(513),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "message token shorter than 32 lowercase hex characters",
      key: "DOUYIN_COMPONENT_MESSAGE_TOKEN",
      value: "a".repeat(31),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "message token containing uppercase hex",
      key: "DOUYIN_COMPONENT_MESSAGE_TOKEN",
      value: "A".repeat(32),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "padded message AES key",
      key: "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      value: `${MESSAGE_AES_KEY}=`,
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "leading ASCII whitespace around message AES key",
      key: "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      value: ` ${MESSAGE_AES_KEY}`,
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "trailing ASCII whitespace around message AES key",
      key: "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      value: `${MESSAGE_AES_KEY} `,
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "Unicode whitespace around message AES key",
      key: "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      value: `\u2003${MESSAGE_AES_KEY}\u00a0`,
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "31-byte message AES key",
      key: "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      value: Buffer.alloc(31, 0x41).toString("base64").replace(/=+$/, ""),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "noncanonical message AES key padding bits",
      key: "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      value: `${MESSAGE_AES_KEY.slice(0, -1)}F`,
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "malformed credential JSON",
      key: "DOUYIN_CREDENTIAL_KEYS_JSON",
      value: "{not-json",
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "non-object credential JSON",
      key: "DOUYIN_CREDENTIAL_KEYS_JSON",
      value: JSON.stringify([CREDENTIAL_KEY]),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "credential JSON with more than the v1 own property",
      key: "DOUYIN_CREDENTIAL_KEYS_JSON",
      value: JSON.stringify({ v1: CREDENTIAL_KEY, v2: CREDENTIAL_KEY }),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "credential JSON with noncanonical whitespace",
      key: "DOUYIN_CREDENTIAL_KEYS_JSON",
      value: `{ "v1":${JSON.stringify(CREDENTIAL_KEY)} }`,
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "noncanonical 32-byte standard Base64 credential key",
      key: "DOUYIN_CREDENTIAL_KEYS_JSON",
      value: JSON.stringify({
        v1: `${CREDENTIAL_KEY.slice(0, -2)}J=`,
      }),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "active credential version other than v1",
      key: "DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION",
      value: "v2",
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "subject hash shorter than 64 lowercase hex characters",
      key: "DOUYIN_SUBJECT_HASH_KEY",
      value: "c".repeat(63),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "subject hash containing uppercase hex",
      key: "DOUYIN_SUBJECT_HASH_KEY",
      value: "C".repeat(64),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
  ];

  test.each(invalidValueCases)(
    "rejects and redacts invalid handoff/config value: $name",
    ({ key, value, code }) => {
      captureValidationError(
        buildPayload(overrideValue(key, value)),
        code,
        [value, COMPONENT_SECRET, TEMPLATE_SECRET],
      );
    },
  );

  test("CLI accepts only a protected regular payload file and prints one metadata line", () => {
    const payloadPath = join(temporaryRoot, "douyin.env");
    writeFileSync(payloadPath, buildPayload(), { mode: 0o600 });
    chmodSync(payloadPath, 0o600);

    const result = runCli(["validate", "--payload", payloadPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`${JSON.stringify(EXPECTED_METADATA)}\n`);
    for (const forbidden of [
      COMPONENT_SECRET,
      TEMPLATE_SECRET,
      MESSAGE_TOKEN,
      MESSAGE_AES_KEY,
      CREDENTIAL_KEY,
      COMPONENT_APP_ID,
      TEMPLATE_APP_ID,
      "ambient-component-id-must-not-be-used",
      "ambient-component-secret-must-not-be-used",
    ]) {
      expect(result.stdout).not.toContain(forbidden);
    }
  });

  test("CLI rejects a wrong-mode payload file without changing its contents", () => {
    const payloadPath = join(temporaryRoot, "wrong-mode.env");
    const source = buildPayload();
    writeFileSync(payloadPath, source, { mode: 0o644 });
    chmodSync(payloadPath, 0o644);

    const result = runCli(["validate", "--payload", payloadPath]);

    expect(result).toEqual({
      exitCode: 2,
      stdout: "",
      stderr: "DOUYIN_DEV_ENV_FILE_INVALID\n",
    });
    expect(readFileSync(payloadPath, "utf8")).toBe(source);
    expect(`${result.stdout}${result.stderr}`).not.toContain(COMPONENT_SECRET);
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEMPLATE_SECRET);
  });

  test("CLI rejects a symlink without reading or changing its source", () => {
    const sourcePath = join(temporaryRoot, "source.env");
    const symlinkPath = join(temporaryRoot, "symlink.env");
    const source = buildPayload();
    writeFileSync(sourcePath, source, { mode: 0o600 });
    chmodSync(sourcePath, 0o600);
    symlinkSync(sourcePath, symlinkPath);

    const result = runCli(["validate", "--payload", symlinkPath]);

    expect(result).toEqual({
      exitCode: 2,
      stdout: "",
      stderr: "DOUYIN_DEV_ENV_FILE_INVALID\n",
    });
    expect(readFileSync(sourcePath, "utf8")).toBe(source);
    expect(`${result.stdout}${result.stderr}`).not.toContain(COMPONENT_SECRET);
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEMPLATE_SECRET);
  });

  const cliFailureCases: Array<{
    readonly name: string;
    readonly args: (payloadPath: string) => readonly string[];
    readonly payload: string;
    readonly expectedCode:
      | "DOUYIN_DEV_ENV_USAGE_INVALID"
      | ExpectedValidationCode;
  }> = [
    {
      name: "usage error",
      args: () => ["validate"],
      payload: buildPayload(),
      expectedCode: "DOUYIN_DEV_ENV_USAGE_INVALID",
    },
    {
      name: "payload error",
      args: (payloadPath) => ["validate", "--payload", payloadPath],
      payload: buildPayload().slice(0, -1),
      expectedCode: "DOUYIN_DEV_ENV_PAYLOAD_INVALID",
    },
    {
      name: "input error",
      args: (payloadPath) => ["validate", "--payload", payloadPath],
      payload: buildPayload({
        DOUYIN_COMPONENT_APP_SECRET: "invalid$console$value",
      }),
      expectedCode: "DOUYIN_DEV_ENV_INPUT_INVALID",
    },
    {
      name: "config error",
      args: (payloadPath) => ["validate", "--payload", payloadPath],
      payload: buildPayload({
        DOUYIN_COMPONENT_MESSAGE_TOKEN: "not-a-token",
      }),
      expectedCode: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
  ];

  test.each(cliFailureCases)(
    "CLI returns a stable redacted code for $name",
    ({ args, payload, expectedCode }) => {
      const payloadPath = join(temporaryRoot, "invalid.env");
      writeFileSync(payloadPath, payload, { mode: 0o600 });
      chmodSync(payloadPath, 0o600);

      const result = runCli(args(payloadPath));

      expect(result).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: `${expectedCode}\n`,
      });
      for (const forbidden of [
        COMPONENT_SECRET,
        TEMPLATE_SECRET,
        payload,
      ]) {
        expect(`${result.stdout}${result.stderr}`).not.toContain(forbidden);
      }
    },
  );
});
