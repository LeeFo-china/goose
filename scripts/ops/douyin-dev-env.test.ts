import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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
const REMOTE_SCRIPT = fileURLToPath(
  new URL("./apply-douyin-dev-env-remote.sh", import.meta.url),
);
const API_DIRECTORY = fileURLToPath(new URL("../../apps/api/", import.meta.url));
const textEncoder = new TextEncoder();

const REMOTE_SECRET_SENTINELS = [
  COMPONENT_SECRET,
  TEMPLATE_SECRET,
  MESSAGE_TOKEN,
  MESSAGE_AES_KEY,
  CREDENTIAL_KEY,
  CREDENTIAL_KEYS_JSON,
  SUBJECT_HASH_KEY,
  COMPONENT_APP_ID,
  TEMPLATE_APP_ID,
] as const;

const REMOTE_ORIGINAL = "SUPABASE_URL=https://dev.invalid\nJWT_SECRET=existing\n";
const REMOTE_CONTAINER_INSPECT_FORMAT =
  "{{.Id}}|{{.State.StartedAt}}|{{.Config.Image}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}";
const REMOTE_TEMPORARY_ROOTS = new Set<string>();

const LOCAL_USER = readIdValue("-un");
const LOCAL_GROUP = readIdValue("-gn");
const EXPECTED_OWNER = `${LOCAL_USER}:${LOCAL_GROUP}`;

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

interface RemoteHarnessPaths {
  readonly root: string;
  readonly targetDir: string;
  readonly targetFile: string;
  readonly payloadFile: string;
  readonly testBin: string;
  readonly original: Buffer;
  readonly payload: Buffer;
}

interface RemoteHarnessOptions {
  readonly original?: string;
  readonly payload?: string;
  readonly expectedPayloadSha?: string;
  readonly functionOverrides?: string;
  readonly prepare?: (paths: RemoteHarnessPaths) => void;
}

interface RemoteHarnessResult extends RemoteHarnessPaths {
  readonly result: CliResult;
}

function readIdValue(flag: "-un" | "-gn"): string {
  const result = Bun.spawnSync({
    cmd: ["id", flag],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    return "local-id-command-failed";
  }

  return result.stdout.toString().trim();
}

function sha256Bytes(value: Uint8Array): string {
  return Bun.CryptoHasher.hash("sha256", value, "hex");
}

function runRemoteTransaction(
  options: RemoteHarnessOptions = {},
): RemoteHarnessResult {
  const root = mkdtempSync(join(tmpdir(), "gooes-douyin-remote-env-"));
  REMOTE_TEMPORARY_ROOTS.add(root);

  const targetDir = join(root, "opt", "gooes-dev", "docker");
  const targetFile = join(targetDir, ".env.dev.api");
  const payloadFile = join(targetDir, ".douyin-env-upload.ABC123");
  const testBin = join(root, "test-bin");
  const original = Buffer.from(options.original ?? REMOTE_ORIGINAL, "utf8");
  const payload = Buffer.from(options.payload ?? buildPayload(), "utf8");

  mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  mkdirSync(testBin, { mode: 0o700 });
  writeFileSync(targetFile, original, { mode: 0o600 });
  writeFileSync(payloadFile, payload, { mode: 0o600 });
  chmodSync(targetFile, 0o600);
  chmodSync(payloadFile, 0o600);

  const fakeFlock = join(testBin, "flock");
  const fakeDocker = join(testBin, "docker");
  writeFileSync(fakeFlock, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o700 });
  writeFileSync(
    fakeDocker,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `if [[ "$#" -ne 4 || "$1" != "inspect" || "$2" != "--format" || "$3" != '${REMOTE_CONTAINER_INSPECT_FORMAT}' || "$4" != "gooes-api-dev" ]]; then`,
      "  exit 64",
      "fi",
      "printf '%s\\n' 'fixed-id|fixed-start|fixed-image|healthy'",
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  chmodSync(fakeFlock, 0o700);
  chmodSync(fakeDocker, 0o700);

  const paths: RemoteHarnessPaths = {
    root,
    targetDir,
    targetFile,
    payloadFile,
    testBin,
    original,
    payload,
  };
  options.prepare?.(paths);

  const expectedPayloadSha = options.expectedPayloadSha ?? sha256Bytes(payload);
  const bashProgram = [
    "set -euo pipefail",
    'source "$REMOTE_SCRIPT"',
    options.functionOverrides ?? ":",
    'apply_douyin_env_transaction "$TARGET_DIR" "$TARGET_FILE" "$PAYLOAD_FILE" "$EXPECTED_OWNER" "gooes-api-dev" "$EXPECTED_PAYLOAD_SHA"',
  ].join("\n");
  const spawned = Bun.spawnSync({
    cmd: ["/bin/bash", "-c", bashProgram],
    cwd: root,
    env: {
      ...process.env,
      DOUYIN_DEV_ENV_SOURCE_ONLY: "1",
      EXPECTED_OWNER,
      EXPECTED_PAYLOAD_SHA: expectedPayloadSha,
      PATH: `${testBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      PAYLOAD_FILE: payloadFile,
      REMOTE_SCRIPT,
      TARGET_DIR: targetDir,
      TARGET_FILE: targetFile,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    ...paths,
    result: {
      exitCode: spawned.exitCode,
      stdout: spawned.stdout.toString(),
      stderr: spawned.stderr.toString(),
    },
  };
}

function cleanupRemoteTemporaryRoots(): void {
  for (const root of REMOTE_TEMPORARY_ROOTS) {
    rmSync(root, { recursive: true, force: true });
    expect(existsSync(root)).toBe(false);
  }
  REMOTE_TEMPORARY_ROOTS.clear();
}

function expectFileBytes(path: string, expected: Uint8Array): void {
  expect(readFileSync(path).equals(Buffer.from(expected))).toBe(true);
}

function expectMode600(path: string): void {
  expect(statSync(path).mode & 0o7777).toBe(0o600);
}

function findOnlyBackup(targetDir: string): string {
  const backupNames = readdirSync(targetDir).filter((name) =>
    /^\.env\.dev\.api\.backup-[0-9]{14}$/.test(name)
  );
  expect(backupNames).toHaveLength(1);
  return join(targetDir, backupNames[0] ?? "missing-backup");
}

function expectNoRemoteSecrets(
  result: CliResult,
  extraSentinels: readonly string[] = [],
): void {
  const combinedOutput = `${result.stdout}${result.stderr}`;
  for (const sentinel of [...REMOTE_SECRET_SENTINELS, ...extraSentinels]) {
    expect(combinedOutput.includes(sentinel)).toBe(false);
  }
}

function expectRedactedFailure(
  result: CliResult,
  expectedCode: string,
  extraSentinels: readonly string[] = [],
): void {
  expectNoRemoteSecrets(result, extraSentinels);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.split("\n")).toContain(expectedCode);
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

describe("remote douyin env transaction success", () => {
  afterEach(cleanupRemoteTemporaryRoots);

  test("appends the exact payload, creates one validated backup, and cleans upload", () => {
    const harness = runRemoteTransaction();
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);

    expectNoRemoteSecrets(harness.result);
    expect(harness.result.exitCode).toBe(0);
    expect(harness.result.stderr).toBe("");
    expectFileBytes(harness.targetFile, expectedTarget);
    expect(existsSync(harness.payloadFile)).toBe(false);
    expectMode600(harness.targetFile);

    const backupPath = findOnlyBackup(harness.targetDir);
    expectFileBytes(backupPath, harness.original);
    expectMode600(backupPath);
    const metadataLines = harness.result.stdout.split("\n");
    expect(harness.result.stdout).toContain("logical_server=gooes-dev-vm-0-11\n");
    expect(metadataLines).toContain("target=/opt/gooes-dev/docker/.env.dev.api");
    expect(metadataLines).toContain(`backup=${backupPath}`);
    expect(harness.result.stdout.includes("fixed_target=")).toBe(false);
    expect(harness.result.stdout.includes("backup_path=")).toBe(false);
    expect(harness.result.stdout).toContain("nine_keys_valid=true\n");
    expect(harness.result.stdout).toContain("remote_cleanup=true\n");
  });

  test("replaces one old copy of every target key on rerun", () => {
    const oldEntries = DOUYIN_ENV_KEYS.map((key, index) => {
      const secret = `old-fake-secret-${index}`;
      return { record: `${key}=${secret}`, secret };
    });
    const originalText = [
      "BASE=value",
      ...oldEntries.map(({ record }) => record),
      "",
    ].join("\n");
    const harness = runRemoteTransaction({ original: originalText });
    const expectedTarget = Buffer.from(`BASE=value\n${buildPayload()}`, "utf8");

    expectNoRemoteSecrets(
      harness.result,
      oldEntries.map(({ secret }) => secret),
    );
    expect(harness.result.exitCode).toBe(0);
    expectFileBytes(harness.targetFile, expectedTarget);
    const updatedTarget = readFileSync(harness.targetFile, "utf8");
    const updatedLines = updatedTarget.split("\n");
    for (const key of DOUYIN_ENV_KEYS) {
      expect(
        updatedLines.filter((line) => line.startsWith(`${key}=`)),
      ).toHaveLength(1);
    }
    for (const { secret } of oldEntries) {
      expect(updatedTarget.includes(secret)).toBe(false);
    }

    const backupPath = findOnlyBackup(harness.targetDir);
    expectFileBytes(backupPath, harness.original);
  });

  test("adds exactly one LF separator when the original has no final LF", () => {
    const harness = runRemoteTransaction({ original: "BASE=value" });
    const expectedTarget = Buffer.from(`BASE=value\n${buildPayload()}`, "utf8");

    expectNoRemoteSecrets(harness.result);
    expect(harness.result.exitCode).toBe(0);
    expectFileBytes(harness.targetFile, expectedTarget);
    const backupPath = findOnlyBackup(harness.targetDir);
    expectFileBytes(backupPath, harness.original);
  });

  test("preserves complex non-target bytes while appending the payload", () => {
    const originalText = [
      "# keep this comment",
      "",
      "SPACED_KEY = value with spaces  ",
      "装修平台=启用",
      "EQUALS=a=b=c",
      "",
    ].join("\n");
    const harness = runRemoteTransaction({ original: originalText });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);

    expectNoRemoteSecrets(harness.result);
    expect(harness.result.exitCode).toBe(0);
    expectFileBytes(harness.targetFile, expectedTarget);
    const backupPath = findOnlyBackup(harness.targetDir);
    expectFileBytes(backupPath, harness.original);
  });

  test("rejects a colliding fixed backup timestamp without deleting the collision", () => {
    const fixedTimestamp = "20260720112233";
    const collisionBytes = Buffer.from("pre-existing-collision\n", "utf8");
    let collisionPath = "";
    const harness = runRemoteTransaction({
      functionOverrides: `backup_timestamp() { printf '%s\\n' '${fixedTimestamp}'; }`,
      prepare: (paths) => {
        collisionPath = `${paths.targetFile}.backup-${fixedTimestamp}`;
        writeFileSync(collisionPath, collisionBytes, { mode: 0o600 });
        chmodSync(collisionPath, 0o600);
      },
    });

    expectRedactedFailure(harness.result, "REMOTE_BACKUP_FAILED");
    expectFileBytes(harness.targetFile, harness.original);
    expectFileBytes(collisionPath, collisionBytes);
    expect(existsSync(collisionPath)).toBe(true);
  });
});

describe("remote douyin env transaction baseline rejection", () => {
  afterEach(cleanupRemoteTemporaryRoots);

  test("does not let source-only mode bypass main during direct execution", () => {
    const spawned = Bun.spawnSync({
      cmd: ["/bin/bash", REMOTE_SCRIPT],
      env: {
        ...process.env,
        DOUYIN_DEV_ENV_SOURCE_ONLY: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const result: CliResult = {
      exitCode: spawned.exitCode,
      stdout: spawned.stdout.toString(),
      stderr: spawned.stderr.toString(),
    };

    expectRedactedFailure(result, "REMOTE_USAGE_INVALID");
  });

  test("marks the target as possibly replaced before the atomic move", () => {
    const source = readFileSync(REMOTE_SCRIPT, "utf8");
    const riskMarker = '  TARGET_REPLACED=true\n';
    const moveMarker = '  if ! mv "$CANDIDATE_PATH" "$target_file"';
    const riskIndex = source.indexOf(riskMarker);
    const moveIndex = source.indexOf(moveMarker);

    expect(riskIndex).toBeGreaterThan(-1);
    expect(moveIndex).toBeGreaterThan(-1);
    expect(riskIndex).toBeLessThan(moveIndex);
  });

  test("reports replacement uncertainty when TERM arrives at the atomic move", () => {
    const functionOverrides = [
      "mv() {",
      '  kill -TERM "$$"',
      "}",
    ].join("\n");
    const harness = runRemoteTransaction({ functionOverrides });
    const targetWarnings = harness.result.stderr
      .split("\n")
      .filter((line) => line === "target_may_be_updated=true");

    expectNoRemoteSecrets(harness.result);
    expect(harness.result.exitCode).toBe(143);
    expect(targetWarnings).toHaveLength(1);
    expect(harness.result.stdout).toContain("remote_cleanup=true\n");
    expectFileBytes(harness.targetFile, harness.original);
  });

  test("rejects a wrong expected payload digest without replacing target", () => {
    const harness = runRemoteTransaction({
      expectedPayloadSha: "0".repeat(64),
    });

    expectRedactedFailure(harness.result, "REMOTE_PAYLOAD_INVALID");
    expectFileBytes(harness.targetFile, harness.original);
  });

  const malformedRemotePayloadCases: ReadonlyArray<{
    readonly name: string;
    readonly payload: string;
  }> = [
    {
      name: "missing final LF",
      payload: buildPayload().slice(0, -1),
    },
    {
      name: "carriage return",
      payload: buildPayload().replace("\n", "\r\n"),
    },
    {
      name: "NUL byte",
      payload: buildPayload().replace("=", "=\0"),
    },
    {
      name: "wrong record count",
      payload: `${payloadLines().slice(0, -1).join("\n")}\n`,
    },
    {
      name: "wrong key order",
      payload: (() => {
        const lines = payloadLines();
        const first = lines[0] ?? "";
        lines[0] = lines[1] ?? "";
        lines[1] = first;
        return `${lines.join("\n")}\n`;
      })(),
    },
    {
      name: "empty value",
      payload: buildPayload({ DOUYIN_COMPONENT_APP_SECRET: "" }),
    },
  ];

  test.each(malformedRemotePayloadCases)(
    "rejects malformed remote payload without replacing target: $name",
    ({ payload }) => {
      const harness = runRemoteTransaction({ payload });

      expectRedactedFailure(harness.result, "REMOTE_PAYLOAD_INVALID");
      expectFileBytes(harness.targetFile, harness.original);
    },
  );

  test("rejects duplicate known keys in the existing target", () => {
    const harness = runRemoteTransaction({
      original: [
        "BASE=value",
        "DOUYIN_COMPONENT_APP_ID=old-one",
        "DOUYIN_COMPONENT_APP_ID=old-two",
        "",
      ].join("\n"),
    });

    expectRedactedFailure(harness.result, "REMOTE_TARGET_STATE_INVALID");
    expectFileBytes(harness.targetFile, harness.original);
  });

  test("rejects an unknown DOUYIN key in the existing target", () => {
    const harness = runRemoteTransaction({
      original: "BASE=value\nDOUYIN_UNAPPROVED_KEY=value\n",
    });

    expectRedactedFailure(harness.result, "REMOTE_TARGET_STATE_INVALID");
    expectFileBytes(harness.targetFile, harness.original);
  });

  const insecureFileCases: ReadonlyArray<{
    readonly name: string;
    readonly functionOverrides?: string;
    readonly prepare?: (paths: RemoteHarnessPaths) => void;
  }> = [
    {
      name: "target symlink",
      prepare: (paths) => {
        const sourcePath = join(paths.root, "target-source.env");
        writeFileSync(sourcePath, paths.original, { mode: 0o600 });
        chmodSync(sourcePath, 0o600);
        rmSync(paths.targetFile);
        symlinkSync(sourcePath, paths.targetFile);
      },
    },
    {
      name: "payload symlink",
      prepare: (paths) => {
        const sourcePath = join(paths.root, "payload-source.env");
        writeFileSync(sourcePath, paths.payload, { mode: 0o600 });
        chmodSync(sourcePath, 0o600);
        rmSync(paths.payloadFile);
        symlinkSync(sourcePath, paths.payloadFile);
      },
    },
    {
      name: "target mode 0644",
      prepare: (paths) => chmodSync(paths.targetFile, 0o644),
    },
    {
      name: "payload mode 0644",
      prepare: (paths) => chmodSync(paths.payloadFile, 0o644),
    },
    {
      name: "injected wrong target owner",
      functionOverrides: [
        "file_owner() {",
        '  local path="$1"',
        '  if [[ "$path" == "$TARGET_FILE" ]]; then',
        "    printf '%s\\n' 'wrong-owner:wrong-group'",
        "  else",
        "    printf '%s\\n' \"$EXPECTED_OWNER\"",
        "  fi",
        "}",
      ].join("\n"),
    },
    {
      name: "injected wrong upload owner",
      functionOverrides: [
        "file_owner() {",
        '  local path="$1"',
        '  if [[ "$path" == "$PAYLOAD_FILE" ]]; then',
        "    printf '%s\\n' 'wrong-owner:wrong-group'",
        "  else",
        "    printf '%s\\n' \"$EXPECTED_OWNER\"",
        "  fi",
        "}",
      ].join("\n"),
    },
  ];

  test.each(insecureFileCases)(
    "fails safely without replacing target for $name",
    ({ functionOverrides, prepare }) => {
      const harness = runRemoteTransaction({ functionOverrides, prepare });
      expectNoRemoteSecrets(harness.result);
      const stableCodes = harness.result.stderr
        .split("\n")
        .filter((line) => /^REMOTE_[A-Z_]+$/.test(line));

      expect(harness.result.exitCode).not.toBe(0);
      expect(stableCodes.length).toBeGreaterThan(0);
      expectFileBytes(harness.targetFile, harness.original);
    },
  );

  test("surfaces upload cleanup failure after an otherwise successful replacement", () => {
    const functionOverrides = [
      "remove_temp_path() {",
      '  local path="$1"',
      '  if [[ "$path" == "$PAYLOAD_FILE" ]]; then',
      "    return 1",
      "  fi",
      '  if [[ -e "$path" || -L "$path" ]]; then',
      '    rm -f "$path"',
      "  fi",
      "}",
    ].join("\n");
    const harness = runRemoteTransaction({ functionOverrides });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);

    expectRedactedFailure(harness.result, "CLEANUP_FAILED");
    expect(harness.result.stderr).toContain("target_may_be_updated=true\n");
    expectFileBytes(harness.targetFile, expectedTarget);
    expect(existsSync(harness.payloadFile)).toBe(true);
    expect(statSync(harness.payloadFile).isFile()).toBe(true);
  });
});
