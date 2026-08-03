import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
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
const ENTRY_SCRIPT = fileURLToPath(
  new URL("./configure-douyin-dev-env.sh", import.meta.url),
);
const REPOSITORY_ROOT = fileURLToPath(
  new URL("../../", import.meta.url),
).replace(/\/$/, "");
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
const ENTRY_TEMPORARY_ROOTS = new Set<string>();

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

interface EntryHarnessResult {
  readonly root: string;
  readonly workDir: string;
  readonly result: CliResult;
}

interface EntryPathHarness {
  readonly root: string;
  readonly workDir: string;
  readonly testBin: string;
  readonly fakeRepositoryRoot: string;
  readonly payloadPath: string;
  readonly opensslLog: string;
  readonly bunLog: string;
  readonly sshLog: string;
  readonly scpLog: string;
  readonly applyStdinPath: string;
  readonly envLog: string;
}

const ENTRY_EXPORTED_LOCAL_SENTINELS = {
  component_app_id: "exported-component-app-id-sentinel",
  component_secret: "exported-component-secret-sentinel",
  component_secret_confirm: "exported-component-secret-confirm-sentinel",
  template_app_id: "exported-template-app-id-sentinel",
  template_secret: "exported-template-secret-sentinel",
  template_secret_confirm: "exported-template-secret-confirm-sentinel",
  message_token: "exported-message-token-sentinel",
  message_aes_key: "exported-message-aes-key-sentinel",
  credential_key: "exported-credential-key-sentinel",
  subject_hash_key: "exported-subject-hash-key-sentinel",
  value: "exported-helper-value-sentinel",
} as const;

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

const ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES = `
read_hidden_value() {
  case "$1" in
    component_app_id) printf '%s' '${COMPONENT_APP_ID}' ;;
    component_app_secret|component_app_secret_confirm) printf '%s' '${COMPONENT_SECRET}' ;;
    template_app_id) printf '%s' '${TEMPLATE_APP_ID}' ;;
    template_app_secret|template_app_secret_confirm) printf '%s' '${TEMPLATE_SECRET}' ;;
    *) return 1 ;;
  esac
}
read_confirmation() { printf '%s' 'APPLY DOUYIN DEV ENV A01'; }
show_confirmation_prompt() { return 0; }
generate_message_token() { printf '%s' '${MESSAGE_TOKEN}'; }
generate_message_aes_key() { printf '%s' '${MESSAGE_AES_KEY}'; }
generate_credential_key() { printf '%s' '${CREDENTIAL_KEY}'; }
generate_subject_hash_key() { printf '%s' '${"0".repeat(64)}'; }
`;

const ENTRY_INPUT_ONLY_OVERRIDES = `
read_hidden_value() {
  case "$1" in
    component_app_id) printf '%s' '${COMPONENT_APP_ID}' ;;
    component_app_secret|component_app_secret_confirm) printf '%s' '${COMPONENT_SECRET}' ;;
    template_app_id) printf '%s' '${TEMPLATE_APP_ID}' ;;
    template_app_secret|template_app_secret_confirm) printf '%s' '${TEMPLATE_SECRET}' ;;
    *) return 1 ;;
  esac
}
read_confirmation() { printf '%s' 'APPLY DOUYIN DEV ENV A01'; }
show_confirmation_prompt() { return 0; }
`;

function runEntryWorkflow(functionOverrides: string): EntryHarnessResult {
  const root = mkdtempSync(join(tmpdir(), "gooes-douyin-entry-env-"));
  ENTRY_TEMPORARY_ROOTS.add(root);
  const workDir = join(root, "work");
  mkdirSync(workDir, { mode: 0o700 });
  chmodSync(workDir, 0o700);

  const bashProgram = [
    "set -euo pipefail",
    'source "$ENTRY_SCRIPT"',
    functionOverrides,
    'run_configure_workflow "$WORK_DIR" "$REPOSITORY_ROOT"',
  ].join("\n");
  const spawned = Bun.spawnSync({
    cmd: ["/bin/bash", "-c", bashProgram],
    env: {
      ...process.env,
      DOUYIN_COMPONENT_APP_ID: "ambient-component-id-must-not-be-used",
      DOUYIN_COMPONENT_APP_SECRET: "ambient-component-secret-must-not-be-used",
      DOUYIN_DEV_ENV_SOURCE_ONLY: "1",
      DOUYIN_TEMPLATE_APP_ID: "ambient-template-id-must-not-be-used",
      DOUYIN_TEMPLATE_APP_SECRET: "ambient-template-secret-must-not-be-used",
      ENTRY_SCRIPT,
      REPOSITORY_ROOT,
      TEST_ROOT: root,
      WORK_DIR: workDir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    root,
    workDir,
    result: {
      exitCode: spawned.exitCode,
      stdout: spawned.stdout.toString(),
      stderr: spawned.stderr.toString(),
    },
  };
}

function writeEntryPathStub(path: string, lines: readonly string[]): void {
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function entryPathEnvSnapshotLines(wrapper: string): string[] {
  return [
    `printf 'wrapper=%s\\n' '${wrapper}' >> "$STUB_ENV_LOG"`,
    ...Object.keys(ENTRY_EXPORTED_LOCAL_SENTINELS).map(
      (name) =>
        `if [[ "\${${name}+present}" == present ]]; then printf 'present=%s\\n' '${name}' >> "$STUB_ENV_LOG"; fi`,
    ),
  ];
}

function createEntryPathHarness(): EntryPathHarness {
  const root = mkdtempSync(join(tmpdir(), "gooes-douyin-entry-path-"));
  ENTRY_TEMPORARY_ROOTS.add(root);
  const workDir = join(root, "work");
  const testBin = join(root, "test-bin");
  const fakeRepositoryRoot = join(root, "fake-repository");
  const payloadPath = join(root, "payload.env");
  const opensslLog = join(root, "openssl.log");
  const bunLog = join(root, "bun.log");
  const sshLog = join(root, "ssh.log");
  const scpLog = join(root, "scp.log");
  const applyStdinPath = join(root, "apply-stdin.sh");
  const envLog = join(root, "wrapper-env.log");

  mkdirSync(workDir, { mode: 0o700 });
  chmodSync(workDir, 0o700);
  mkdirSync(testBin, { mode: 0o700 });
  mkdirSync(join(fakeRepositoryRoot, "apps", "api"), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(payloadPath, buildPayload(), { mode: 0o600 });
  chmodSync(payloadPath, 0o600);

  writeEntryPathStub(join(testBin, "openssl"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    ...entryPathEnvSnapshotLines("openssl"),
    "printf 'argc=%s\\targ1=%s\\targ2=%s\\targ3=%s\\n' \"$#\" \"${1:-}\" \"${2:-}\" \"${3:-}\" >> \"$STUB_OPENSSL_LOG\"",
    "if [[ \"${STUB_OPENSSL_FAIL:-}\" == \"$*\" ]]; then exit 41; fi",
    "case \"$*\" in",
    `  "rand -hex 16") printf '%s\\n' '${MESSAGE_TOKEN}' ;;`,
    "  \"rand -base64 32\")",
    "    count=0",
    "    if [[ -f \"$STUB_OPENSSL_COUNT\" ]]; then IFS= read -r count < \"$STUB_OPENSSL_COUNT\"; fi",
    "    count=$((count + 1))",
    "    printf '%s\\n' \"$count\" > \"$STUB_OPENSSL_COUNT\"",
    `    if [[ "$count" -eq 1 ]]; then printf '%s\\n' '${MESSAGE_AES_KEY}='; else printf '%s\\n' '${CREDENTIAL_KEY}'; fi`,
    "    ;;",
    `  "rand -hex 32") printf '%s\\n' '${"0".repeat(64)}' ;;`,
    "  *) exit 64 ;;",
    "esac",
  ]);

  writeEntryPathStub(join(testBin, "bun"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    ...entryPathEnvSnapshotLines("bun"),
    "printf 'cwd=%s\\nargc=%s\\n' \"$PWD\" \"$#\" > \"$STUB_BUN_LOG\"",
    "for arg in \"$@\"; do printf 'arg=%s\\n' \"$arg\" >> \"$STUB_BUN_LOG\"; done",
    "if [[ \"${STUB_BUN_FAIL:-0}\" == 1 ]]; then exit 42; fi",
    `printf '%s\\n' '${JSON.stringify(EXPECTED_METADATA)}'`,
  ]);

  writeEntryPathStub(join(testBin, "scp"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    ...entryPathEnvSnapshotLines("scp"),
    "printf 'argc=%s\\n' \"$#\" > \"$STUB_SCP_LOG\"",
    "for arg in \"$@\"; do printf 'arg=%s\\n' \"$arg\" >> \"$STUB_SCP_LOG\"; done",
    "if [[ \"${STUB_SCP_FAIL:-0}\" == 1 ]]; then exit 43; fi",
  ]);

  writeEntryPathStub(join(testBin, "ssh"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    ...entryPathEnvSnapshotLines("ssh"),
    "printf 'call\\nargc=%s\\n' \"$#\" >> \"$STUB_SSH_LOG\"",
    "for arg in \"$@\"; do printf 'arg=%s\\n' \"$arg\" >> \"$STUB_SSH_LOG\"; done",
    "printf '%s\\n' 'end' >> \"$STUB_SSH_LOG\"",
    "command_arg=\"${2:-}\"",
    "create_command=\"umask 077; mktemp '/opt/gooes-dev/docker/.douyin-env-upload.XXXXXX'\"",
    "cleanup_command=\"if [ -e '$STUB_REMOTE_PATH' ] || [ -L '$STUB_REMOTE_PATH' ]; then rm -- '$STUB_REMOTE_PATH'; fi\"",
    "if [[ \"$command_arg\" == \"$create_command\" ]]; then",
    "  printf '%s\\n' \"$STUB_REMOTE_PATH\"",
    "  if [[ \"${STUB_SSH_CREATE_FAIL:-0}\" == 1 ]]; then exit 44; fi",
    "  exit 0",
    "fi",
    "if [[ \"$command_arg\" == env\\ -u\\ DOUYIN_DEV_ENV_SOURCE_ONLY\\ bash\\ -s\\ --* ]]; then",
    "  : > \"$STUB_APPLY_STDIN\"",
    "  while IFS= read -r line || [[ -n \"$line\" ]]; do",
    "    printf '%s\\n' \"$line\" >> \"$STUB_APPLY_STDIN\"",
    "  done",
    "  if [[ \"${STUB_SSH_APPLY_SIGNAL_PARENT:-0}\" == 1 ]]; then kill -TERM \"$PPID\"; exit 143; fi",
    "  if [[ \"${STUB_SSH_APPLY_FAIL:-0}\" == 1 ]]; then exit 45; fi",
    "  printf '%s\\n' 'remote_cleanup=true'",
    "  exit 0",
    "fi",
    "if [[ \"$command_arg\" == \"$cleanup_command\" ]]; then",
    "  if [[ \"${STUB_SSH_CLEANUP_FAIL:-0}\" == 1 ]]; then exit 46; fi",
    "  exit 0",
    "fi",
    "exit 64",
  ]);

  writeEntryPathStub(join(testBin, "chmod"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    ...entryPathEnvSnapshotLines("chmod"),
    "exec /bin/chmod \"$@\"",
  ]);

  return {
    root,
    workDir,
    testBin,
    fakeRepositoryRoot,
    payloadPath,
    opensslLog,
    bunLog,
    sshLog,
    scpLog,
    applyStdinPath,
    envLog,
  };
}

function runEntryPathProgram(
  harness: EntryPathHarness,
  program: string,
  envOverrides: Readonly<Record<string, string>> = {},
): CliResult {
  const spawned = Bun.spawnSync({
    cmd: ["/bin/bash", "-c", [
      "set -euo pipefail",
      'source "$ENTRY_SCRIPT"',
      program,
    ].join("\n")],
    env: {
      ...process.env,
      ENTRY_SCRIPT,
      PATH: `${harness.testBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      STUB_APPLY_STDIN: harness.applyStdinPath,
      STUB_BUN_LOG: harness.bunLog,
      STUB_ENV_LOG: harness.envLog,
      STUB_OPENSSL_COUNT: join(harness.root, "openssl.count"),
      STUB_OPENSSL_LOG: harness.opensslLog,
      STUB_REMOTE_PATH:
        "/opt/gooes-dev/docker/.douyin-env-upload.ABC123",
      STUB_SCP_LOG: harness.scpLog,
      STUB_SSH_LOG: harness.sshLog,
      TEST_ROOT: harness.root,
      ...envOverrides,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: spawned.exitCode,
    stdout: spawned.stdout.toString(),
    stderr: spawned.stderr.toString(),
  };
}

function runEntryPathWorkflow(
  harness: EntryPathHarness,
  envOverrides: Readonly<Record<string, string>> = {},
): CliResult {
  return runEntryPathProgram(
    harness,
    [
      ENTRY_INPUT_ONLY_OVERRIDES,
      'run_configure_workflow "$WORK_DIR" "$REPOSITORY_ROOT"',
    ].join("\n"),
    {
      REPOSITORY_ROOT,
      WORK_DIR: harness.workDir,
      ...envOverrides,
    },
  );
}

function cleanupEntryTemporaryRoots(): void {
  for (const root of ENTRY_TEMPORARY_ROOTS) {
    rmSync(root, { recursive: true, force: true });
    expect(existsSync(root)).toBe(false);
  }
  ENTRY_TEMPORARY_ROOTS.clear();
}

function expectNoEntrySecrets(
  result: CliResult,
  extraSentinels: readonly string[] = [],
): void {
  expectNoRemoteSecrets(result, [
    "ambient-component-id-must-not-be-used",
    "ambient-component-secret-must-not-be-used",
    "ambient-template-id-must-not-be-used",
    "ambient-template-secret-must-not-be-used",
    ...extraSentinels,
  ]);
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

function findBackupNames(targetDir: string): string[] {
  return readdirSync(targetDir).filter((name) =>
    /^\.env\.dev\.api\.backup-[0-9]{14}$/.test(name)
  );
}

function expectValidBackup(harness: RemoteHarnessResult): string {
  const backupPath = findOnlyBackup(harness.targetDir);
  expectFileBytes(backupPath, harness.original);
  expectMode600(backupPath);
  return backupPath;
}

function countExactKeyRecords(path: string, key: DouyinEnvKey): number {
  const bytes = readFileSync(path);
  const prefix = Buffer.from(`${key}=`, "utf8");
  let count = 0;
  let offset = 0;

  while (offset <= bytes.length) {
    const nextLf = bytes.indexOf(0x0a, offset);
    const lineEnd = nextLf === -1 ? bytes.length : nextLf;
    const line = bytes.subarray(offset, lineEnd);
    if (
      line.length >= prefix.length &&
      line.subarray(0, prefix.length).equals(prefix)
    ) {
      count += 1;
    }
    if (nextLf === -1) {
      break;
    }
    offset = nextLf + 1;
  }

  return count;
}

function expectTargetKeyRecordCount(path: string, expectedCount: number): void {
  for (const key of DOUYIN_ENV_KEYS) {
    expect(countExactKeyRecords(path, key)).toBe(expectedCount);
  }
}

function expectNoRemoteTransactionTemps(
  targetDir: string,
  allowedNames: readonly string[] = [],
): void {
  const allowed = new Set(allowedNames);
  const tempNames = readdirSync(targetDir).filter(
    (name) =>
      /^\.douyin-env-(?:upload|candidate|before|after|target-block|restore)\./.test(
        name,
      ) && !allowed.has(name),
  );
  expect(tempNames).toEqual([]);
}

function targetUpdateWarningCount(result: CliResult): number {
  return result.stderr
    .split("\n")
    .filter((line) => line === "target_may_be_updated=true").length;
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
      name: "canonical message AES key containing a plus sign",
      key: "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      value: Buffer.alloc(32, 0xf8).toString("base64").replace(/=+$/, ""),
      code: "DOUYIN_DEV_ENV_CONFIG_INVALID",
    },
    {
      name: "canonical message AES key containing a slash",
      key: "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
      value: Buffer.alloc(32, 0xfc).toString("base64").replace(/=+$/, ""),
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

describe("local douyin env entry", () => {
  afterEach(cleanupEntryTemporaryRoots);

  test("hard-codes the approved TTY, host, target, and non-mutation boundary", () => {
    const source = readFileSync(ENTRY_SCRIPT, "utf8");

    expect(source).toContain('SSH_ALIAS="gooes-dev"');
    expect(source).toContain('LOGICAL_SERVER="gooes-dev-vm-0-11"');
    expect(source).toContain('TARGET_DIR="/opt/gooes-dev/docker"');
    expect(source).toContain('TARGET_FILE="${TARGET_DIR}/.env.dev.api"');
    expect(source).toContain('CONFIRMATION_PHRASE="APPLY DOUYIN DEV ENV A01"');
    expect(source).toContain("BASH_VERSINFO");
    expect(source).toContain("</dev/tty");
    expect(source).toMatch(/IFS= read -r -s [^\n]+ <\/dev\/tty/);
    expect(source).toContain("env -u DOUYIN_DEV_ENV_SOURCE_ONLY bash -s");
    expect(source).toContain('<"$remote_script"');
    expect(source).toContain('[[ -O "$path" ]]');
    expect(source).toContain('is_current_user_owned "$work_dir"');
    expect(source).toContain('is_current_user_owned "$LOCAL_PAYLOAD_PATH"');
    expect(source).not.toMatch(
      /set -x|rm -rf|eval|docker (?:restart|stop|kill)|docker compose|gh workflow/,
    );
    expect(source).not.toMatch(
      /\$\{?DOUYIN_(?:COMPONENT|TEMPLATE|CREDENTIAL|SUBJECT)/,
    );
    expect(source).not.toMatch(/(?:source|\.) [^\n]*remote_script/);
  });

  test("rejects production positional arguments despite source-only or env overrides", () => {
    const spawned = Bun.spawnSync({
      cmd: ["/bin/bash", ENTRY_SCRIPT, "unexpected"],
      env: {
        ...process.env,
        DOUYIN_DEV_ENV_SOURCE_ONLY: "1",
        LOGICAL_SERVER: "unapproved-server",
        SSH_ALIAS: "unapproved-host",
        TARGET_DIR: "/tmp/unapproved-target",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const result: CliResult = {
      exitCode: spawned.exitCode,
      stdout: spawned.stdout.toString(),
      stderr: spawned.stderr.toString(),
    };

    expect(result).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "LOCAL_USAGE_INVALID\n",
    });
    expectNoEntrySecrets(result);
  });

  test("uses PATH OpenSSL and Bun wrappers with exact argv, cwd, and safe metadata", () => {
    const harness = createEntryPathHarness();
    const generatedValuesPath = join(harness.root, "generated-values");
    const stepLogPath = join(harness.root, "wrapper-steps");
    const result = runEntryPathProgram(
      harness,
      `
message_token="$(generate_message_token)"
printf '%s\\n' token >> "$STEP_LOG_PATH"
message_aes_key="$(generate_message_aes_key)"
printf '%s\\n' aes >> "$STEP_LOG_PATH"
credential_key="$(generate_credential_key)"
printf '%s\\n' credential >> "$STEP_LOG_PATH"
subject_hash_key="$(generate_subject_hash_key)"
printf '%s\\n' subject >> "$STEP_LOG_PATH"
printf '%s\\n%s\\n%s\\n%s\\n' \
  "$message_token" "$message_aes_key" "$credential_key" "$subject_hash_key" \
  > "$GENERATED_VALUES_PATH"
metadata="$(validate_local_payload "$FAKE_REPOSITORY_ROOT" "$PAYLOAD_PATH")"
printf '%s\\n' validator >> "$STEP_LOG_PATH"
printf '%s\\n' "$metadata"
printf '%s\\n' 'path-openssl-bun-wrappers=true'
`,
      {
        FAKE_REPOSITORY_ROOT: harness.fakeRepositoryRoot,
        GENERATED_VALUES_PATH: generatedValuesPath,
        PAYLOAD_PATH: harness.payloadPath,
        STEP_LOG_PATH: stepLogPath,
      },
    );

    expect(readFileSync(stepLogPath, "utf8")).toBe(
      "token\naes\ncredential\nsubject\nvalidator\n",
    );
    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        `${JSON.stringify(EXPECTED_METADATA)}\npath-openssl-bun-wrappers=true\n`,
    });
    expect(readFileSync(generatedValuesPath, "utf8")).toBe(
      [MESSAGE_TOKEN, MESSAGE_AES_KEY, CREDENTIAL_KEY, "0".repeat(64), ""].join(
        "\n",
      ),
    );
    expect(readFileSync(harness.opensslLog, "utf8")).toBe(
      [
        "argc=3\targ1=rand\targ2=-hex\targ3=16",
        "argc=3\targ1=rand\targ2=-base64\targ3=32",
        "argc=3\targ1=rand\targ2=-base64\targ3=32",
        "argc=3\targ1=rand\targ2=-hex\targ3=32",
        "",
      ].join("\n"),
    );
    expect(readFileSync(harness.bunLog, "utf8")).toBe(
      [
        `cwd=${join(harness.fakeRepositoryRoot, "apps", "api")}`,
        "argc=4",
        "arg=../../scripts/ops/douyin-dev-env.ts",
        "arg=validate",
        "arg=--payload",
        `arg=${harness.payloadPath}`,
        "",
      ].join("\n"),
    );
    expectNoEntrySecrets(result);
  });

  test("retries message AES key generation until OpenSSL returns 43 alphanumeric characters", () => {
    const harness = createEntryPathHarness();
    const generatedValuePath = join(harness.root, "generated-message-aes-key");
    const opensslCountPath = join(harness.root, "message-aes-openssl-count");
    const invalidKey = Buffer.alloc(32, 0xff)
      .toString("base64")
      .replace(/=+$/, "");
    const result = runEntryPathProgram(
      harness,
      `
openssl() {
  local count=0
  if [[ -f "$AES_OPENSSL_COUNT_PATH" ]]; then
    IFS= read -r count < "$AES_OPENSSL_COUNT_PATH"
  fi
  count=$((count + 1))
  printf '%s\n' "$count" > "$AES_OPENSSL_COUNT_PATH"
  if [[ "$count" -eq 1 ]]; then
    printf '%s\n' '${invalidKey}='
    return 0
  fi
  printf '%s\n' '${MESSAGE_AES_KEY}='
}
generated_value="$(generate_message_aes_key)"
printf '%s\n' "$generated_value" > "$GENERATED_VALUE_PATH"
`,
      {
        AES_OPENSSL_COUNT_PATH: opensslCountPath,
        GENERATED_VALUE_PATH: generatedValuePath,
      },
    );

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(readFileSync(generatedValuePath, "utf8")).toBe(
      `${MESSAGE_AES_KEY}\n`,
    );
    expect(readFileSync(opensslCountPath, "utf8")).toBe("2\n");
  });

  test("uses PATH SSH and SCP wrappers with the exact fixed create, copy, and cleanup contract", () => {
    const harness = createEntryPathHarness();
    const remotePath =
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123";
    const recordedRemotePath = join(harness.root, "remote-path");
    const result = runEntryPathProgram(
      harness,
      `
remote_path="$(create_remote_upload_path)"
printf '%s\\n' "$remote_path" > "$RECORDED_REMOTE_PATH"
copy_remote_payload "$PAYLOAD_PATH" "$remote_path"
cleanup_remote_upload "$remote_path"
printf '%s\\n' 'path-ssh-scp-wrappers=true'
`,
      {
        PAYLOAD_PATH: harness.payloadPath,
        RECORDED_REMOTE_PATH: recordedRemotePath,
      },
    );

    expect(result).toEqual({
      exitCode: 0,
      stdout: "path-ssh-scp-wrappers=true\n",
      stderr: "",
    });
    expect(readFileSync(recordedRemotePath, "utf8")).toBe(`${remotePath}\n`);
    expect(readFileSync(harness.scpLog, "utf8")).toBe(
      [
        "argc=4",
        "arg=-q",
        "arg=-p",
        `arg=${harness.payloadPath}`,
        `arg=gooes-dev:${remotePath}`,
        "",
      ].join("\n"),
    );
    expect(readFileSync(harness.sshLog, "utf8")).toBe(
      [
        "call",
        "argc=2",
        "arg=gooes-dev",
        "arg=umask 077; mktemp '/opt/gooes-dev/docker/.douyin-env-upload.XXXXXX'",
        "end",
        "call",
        "argc=2",
        "arg=gooes-dev",
        `arg=if [ -e '${remotePath}' ] || [ -L '${remotePath}' ]; then rm -- '${remotePath}'; fi`,
        "end",
        "",
      ].join("\n"),
    );
    expectNoEntrySecrets(result);
  });

  test("streams the complete remote script through PATH SSH with only path and digest", () => {
    const harness = createEntryPathHarness();
    const remotePath =
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123";
    const payloadDigest = "d".repeat(64);
    const result = runEntryPathProgram(
      harness,
      `
run_remote_apply "$REMOTE_PATH" "$PAYLOAD_DIGEST" "$REMOTE_SCRIPT"
`,
      {
        PAYLOAD_DIGEST: payloadDigest,
        REMOTE_PATH: remotePath,
        REMOTE_SCRIPT,
      },
    );

    expect(result).toEqual({
      exitCode: 0,
      stdout: "remote_cleanup=true\n",
      stderr: "",
    });
    expect(readFileSync(harness.sshLog, "utf8")).toBe(
      [
        "call",
        "argc=2",
        "arg=gooes-dev",
        `arg=env -u DOUYIN_DEV_ENV_SOURCE_ONLY bash -s -- '${remotePath}' '${payloadDigest}'`,
        "end",
        "",
      ].join("\n"),
    );
    expect(readFileSync(harness.applyStdinPath)).toEqual(
      readFileSync(REMOTE_SCRIPT),
    );
    expectNoEntrySecrets(result);
  });

  test("runs the success workflow through PATH wrappers and cleans both exact paths", () => {
    const harness = createEntryPathHarness();
    const result = runEntryPathWorkflow(harness);
    const remotePath =
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123";
    const sshLog = readFileSync(harness.sshLog, "utf8");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("remote_cleanup=true\n");
    expect(result.stdout).toContain("local_cleanup=true\n");
    expect(sshLog).toContain(
      "arg=umask 077; mktemp '/opt/gooes-dev/docker/.douyin-env-upload.XXXXXX'\n",
    );
    expect(sshLog).toContain(
      `arg=if [ -e '${remotePath}' ] || [ -L '${remotePath}' ]; then rm -- '${remotePath}'; fi\n`,
    );
    expect(readFileSync(harness.applyStdinPath)).toEqual(
      readFileSync(REMOTE_SCRIPT),
    );
    expect(existsSync(harness.workDir)).toBe(false);
    expectNoEntrySecrets(result);
  });

  test("keeps inherited hidden and generated local names out of every PATH wrapper environment", () => {
    const harness = createEntryPathHarness();
    const result = runEntryPathWorkflow(
      harness,
      ENTRY_EXPORTED_LOCAL_SENTINELS,
    );
    const envLines = readFileSync(harness.envLog, "utf8").split("\n");

    expect(result.exitCode).toBe(0);
    for (const wrapper of ["openssl", "bun", "scp", "ssh", "chmod"]) {
      expect(envLines).toContain(`wrapper=${wrapper}`);
    }
    for (const name of Object.keys(ENTRY_EXPORTED_LOCAL_SENTINELS)) {
      expect(envLines).not.toContain(`present=${name}`);
    }
    expectNoEntrySecrets(
      result,
      Object.values(ENTRY_EXPORTED_LOCAL_SENTINELS),
    );
    const wrapperLogs = [
      harness.envLog,
      harness.opensslLog,
      harness.bunLog,
      harness.scpLog,
      harness.sshLog,
      harness.applyStdinPath,
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    for (const sentinel of Object.values(ENTRY_EXPORTED_LOCAL_SENTINELS)) {
      expect(wrapperLogs).not.toContain(sentinel);
    }
  });

  const pathWrapperFailureCases = [
    {
      name: "OpenSSL",
      env: { STUB_OPENSSL_FAIL: "rand -hex 16" },
      expectedCode: "LOCAL_RANDOM_FAILED",
      expectsKnownRemoteCleanup: false,
    },
    {
      name: "create SSH",
      env: { STUB_SSH_CREATE_FAIL: "1" },
      expectedCode: "REMOTE_PREFLIGHT_FAILED",
      expectsKnownRemoteCleanup: true,
    },
    {
      name: "SCP",
      env: { STUB_SCP_FAIL: "1" },
      expectedCode: "REMOTE_UPLOAD_FAILED",
      expectsKnownRemoteCleanup: true,
    },
    {
      name: "apply SSH",
      env: { STUB_SSH_APPLY_FAIL: "1" },
      expectedCode: "REMOTE_APPLY_FAILED",
      expectsKnownRemoteCleanup: true,
    },
  ] as const;

  test.each(pathWrapperFailureCases)(
    "stops and redacts PATH $name failure with exact known-path cleanup",
    ({ env, expectedCode, expectsKnownRemoteCleanup }) => {
      const harness = createEntryPathHarness();
      const result = runEntryPathWorkflow(harness, env);
      const remotePath =
        "/opt/gooes-dev/docker/.douyin-env-upload.ABC123";
      const cleanupCommand =
        `arg=if [ -e '${remotePath}' ] || [ -L '${remotePath}' ]; then rm -- '${remotePath}'; fi\n`;
      const sshLog = existsSync(harness.sshLog)
        ? readFileSync(harness.sshLog, "utf8")
        : "";

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(`${expectedCode}\n`);
      expect(result.stdout).toContain("local_cleanup=true\n");
      expect(sshLog.includes(cleanupCommand)).toBe(expectsKnownRemoteCleanup);
      expect(existsSync(harness.workDir)).toBe(false);
      expectNoEntrySecrets(result);
    },
  );

  test("warns exactly once when PATH apply SSH returns nonzero after apply starts", () => {
    const harness = createEntryPathHarness();
    const result = runEntryPathWorkflow(harness, {
      STUB_SSH_APPLY_FAIL: "1",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("REMOTE_APPLY_FAILED\n");
    expect(targetUpdateWarningCount(result)).toBe(1);
    expect(result.stdout).toContain("local_cleanup=true\n");
    expect(existsSync(harness.workDir)).toBe(false);
    expectNoEntrySecrets(result);
  });

  test("uses PATH SSH during TERM and still cleans the exact known paths", () => {
    const harness = createEntryPathHarness();
    const result = runEntryPathWorkflow(harness, {
      STUB_SSH_APPLY_SIGNAL_PARENT: "1",
    });
    const remotePath =
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123";
    const sshLog = readFileSync(harness.sshLog, "utf8");

    expect(result.exitCode).toBe(143);
    expect(targetUpdateWarningCount(result)).toBe(1);
    expect(result.stdout).toContain("local_cleanup=true\n");
    expect(sshLog).toContain(
      `arg=if [ -e '${remotePath}' ] || [ -L '${remotePath}' ]; then rm -- '${remotePath}'; fi\n`,
    );
    expect(readFileSync(harness.applyStdinPath)).toEqual(
      readFileSync(REMOTE_SCRIPT),
    );
    expect(existsSync(harness.workDir)).toBe(false);
    expectNoEntrySecrets(result);
  });

  test("makes a PATH cleanup SSH failure fatal after a successful apply", () => {
    const harness = createEntryPathHarness();
    const result = runEntryPathWorkflow(harness, {
      STUB_SSH_CLEANUP_FAIL: "1",
    });
    const remotePath =
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123";
    const sshLog = readFileSync(harness.sshLog, "utf8");

    expect(result.exitCode).toBe(74);
    expect(result.stderr).toContain("CLEANUP_FAILED\n");
    expect(targetUpdateWarningCount(result)).toBe(1);
    expect(sshLog).toContain(
      `arg=if [ -e '${remotePath}' ] || [ -L '${remotePath}' ]; then rm -- '${remotePath}'; fi\n`,
    );
    expect(existsSync(harness.workDir)).toBe(false);
    expectNoEntrySecrets(result);
  });

  test("reads all four console values and both secret confirmations through one hidden adapter", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
read_hidden_value() {
  printf '%s\\n' "$1" >> "$TEST_ROOT/hidden-fields"
  case "$1" in
    component_app_id) printf '%s' '${COMPONENT_APP_ID}' ;;
    component_app_secret|component_app_secret_confirm) printf '%s' '${COMPONENT_SECRET}' ;;
    template_app_id) printf '%s' '${TEMPLATE_APP_ID}' ;;
    template_app_secret|template_app_secret_confirm) printf '%s' '${TEMPLATE_SECRET}' ;;
    *) return 1 ;;
  esac
}
create_remote_upload_path() { printf '%s' '/opt/gooes-dev/docker/.douyin-env-upload.ABC123'; }
copy_remote_payload() { return 0; }
run_remote_apply() { printf '%s\\n' 'remote_cleanup=true'; }
cleanup_remote_upload() { return 0; }
`);

    expect(context.result.exitCode).toBe(0);
    expect(readFileSync(join(context.root, "hidden-fields"), "utf8")).toBe(
      [
        "component_app_id",
        "component_app_secret",
        "component_app_secret_confirm",
        "template_app_id",
        "template_app_secret",
        "template_app_secret_confirm",
        "",
      ].join("\n"),
    );
    expectNoEntrySecrets(context.result);
    expect(existsSync(context.workDir)).toBe(false);
  });

  test("cancels before generation or upload when a secret confirmation differs", () => {
    const mismatchSecret = "different-secret-sentinel";
    const context = runEntryWorkflow(`
read_hidden_value() {
  case "$1" in
    component_app_id) printf '%s' '${COMPONENT_APP_ID}' ;;
    component_app_secret) printf '%s' '${COMPONENT_SECRET}' ;;
    component_app_secret_confirm) printf '%s' '${mismatchSecret}' ;;
    *) printf '%s' 'unused' ;;
  esac
}
generate_message_token() { : > "$TEST_ROOT/random-called"; }
create_remote_upload_path() { : > "$TEST_ROOT/remote-called"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("LOCAL_INPUT_INVALID\n");
    expect(existsSync(join(context.root, "random-called"))).toBe(false);
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result, [mismatchSecret]);
  });

  test("treats TTY EOF or Ctrl-C read failure as a local cancellation", () => {
    const context = runEntryWorkflow(`
read_hidden_value() { return 1; }
create_remote_upload_path() { : > "$TEST_ROOT/remote-called"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("LOCAL_INPUT_INVALID\n");
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("rejects a work directory that is not owned by the current user", () => {
    const context = runEntryWorkflow(`
is_current_user_owned() { return 1; }
read_hidden_value() { : > "$TEST_ROOT/input-called"; }
create_remote_upload_path() { : > "$TEST_ROOT/remote-called"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("LOCAL_FILE_INVALID\n");
    expect(existsSync(join(context.root, "input-called"))).toBe(false);
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
    expect(existsSync(context.workDir)).toBe(false);
  });

  test("stops before upload when local cryptographic generation fails", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
generate_message_token() { return 1; }
create_remote_upload_path() { : > "$TEST_ROOT/remote-called"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("LOCAL_RANDOM_FAILED\n");
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("stops before confirmation and upload when the real payload validator rejects input", () => {
    const invalidConsoleValue = "invalid$console$value";
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
read_hidden_value() {
  case "$1" in
    component_app_id) printf '%s' '${invalidConsoleValue}' ;;
    component_app_secret|component_app_secret_confirm) printf '%s' '${COMPONENT_SECRET}' ;;
    template_app_id) printf '%s' '${TEMPLATE_APP_ID}' ;;
    template_app_secret|template_app_secret_confirm) printf '%s' '${TEMPLATE_SECRET}' ;;
  esac
}
show_confirmation_prompt() { : > "$TEST_ROOT/confirmation-called"; }
create_remote_upload_path() { : > "$TEST_ROOT/remote-called"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("LOCAL_CONFIG_INVALID\n");
    expect(existsSync(join(context.root, "confirmation-called"))).toBe(false);
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result, [invalidConsoleValue]);
  });

  test("cancels before any remote operation when the confirmation phrase is wrong", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
read_confirmation() { printf '%s' 'NO'; }
create_remote_upload_path() { : > "$TEST_ROOT/remote-called"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("LOCAL_CONFIRMATION_REJECTED\n");
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("builds one protected validated payload and streams only path plus digest remotely", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
create_remote_upload_path() { printf '%s' '/opt/gooes-dev/docker/.douyin-env-upload.ABC123'; }
copy_remote_payload() {
  test "$(file_mode "$1")" = 600
  is_current_user_owned "$1"
  command cp "$1" "$TEST_ROOT/copied-payload"
  printf '%s\\n' "$2" > "$TEST_ROOT/copied-remote-path"
}
run_remote_apply() {
  printf '%s\\n%s\\n%s\\n' "$1" "$2" "$3" > "$TEST_ROOT/remote-args"
  printf '%s\\n' 'remote_cleanup=true'
}
cleanup_remote_upload() { printf '%s\\n' "$1" > "$TEST_ROOT/remote-cleanup"; }
`);

    expect(context.result.exitCode).toBe(0);
    expect(readFileSync(join(context.root, "copied-payload"), "utf8")).toBe(
      buildPayload({ DOUYIN_SUBJECT_HASH_KEY: "0".repeat(64) }),
    );
    expect(readFileSync(join(context.root, "copied-remote-path"), "utf8")).toBe(
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123\n",
    );
    const remoteArgs = readFileSync(
      join(context.root, "remote-args"),
      "utf8",
    ).split("\n");
    expect(remoteArgs[0]).toBe(
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123",
    );
    expect(remoteArgs[1]).toMatch(/^[a-f0-9]{64}$/);
    expect(remoteArgs[2]).toBe(REMOTE_SCRIPT);
    expect(remoteArgs[3]).toBe("");
    expect(readFileSync(join(context.root, "remote-cleanup"), "utf8")).toBe(
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123\n",
    );
    expect(context.result.stdout).toContain("environment=development\n");
    expect(context.result.stdout).toContain(
      "logical_server=gooes-dev-vm-0-11\n",
    );
    expect(context.result.stdout).toContain("ssh_alias=gooes-dev\n");
    expect(context.result.stdout).toContain(
      "target=/opt/gooes-dev/docker/.env.dev.api\n",
    );
    expect(context.result.stdout).toContain("keys=9\n");
    expect(context.result.stdout).toContain(
      "effects=no-restart,no-deploy,no-callback\n",
    );
    expect(context.result.stdout).toContain('"componentAppIdTail":"abc123"');
    expect(context.result.stdout).toContain('"templateAppIdTail":"xyz789"');
    expect(context.result.stdout).toContain("remote_cleanup=true\n");
    expect(context.result.stdout).toContain("local_cleanup=true\n");
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("rejects an unapproved remote upload path before copy or cleanup", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
create_remote_upload_path() { printf '%s' '/tmp/unapproved-upload'; }
copy_remote_payload() { : > "$TEST_ROOT/copy-called"; }
run_remote_apply() { : > "$TEST_ROOT/apply-called"; }
cleanup_remote_upload() { : > "$TEST_ROOT/cleanup-called"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("REMOTE_PREFLIGHT_FAILED\n");
    expect(existsSync(join(context.root, "copy-called"))).toBe(false);
    expect(existsSync(join(context.root, "apply-called"))).toBe(false);
    expect(existsSync(join(context.root, "cleanup-called"))).toBe(false);
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("cleans the exact upload and local workdir after upload failure", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
create_remote_upload_path() { printf '%s' '/opt/gooes-dev/docker/.douyin-env-upload.ABC123'; }
copy_remote_payload() { return 1; }
run_remote_apply() { : > "$TEST_ROOT/apply-called"; }
cleanup_remote_upload() { printf '%s\\n' "$1" > "$TEST_ROOT/remote-cleanup"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("REMOTE_UPLOAD_FAILED\n");
    expect(existsSync(join(context.root, "apply-called"))).toBe(false);
    expect(readFileSync(join(context.root, "remote-cleanup"), "utf8")).toBe(
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123\n",
    );
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("cleans exact paths and warns once after a substituted remote apply failure", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
create_remote_upload_path() { printf '%s' '/opt/gooes-dev/docker/.douyin-env-upload.ABC123'; }
copy_remote_payload() { return 0; }
run_remote_apply() { return 1; }
cleanup_remote_upload() { printf '%s\\n' "$1" > "$TEST_ROOT/remote-cleanup"; }
`);

    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr).toContain("REMOTE_APPLY_FAILED\n");
    expect(targetUpdateWarningCount(context.result)).toBe(1);
    expect(readFileSync(join(context.root, "remote-cleanup"), "utf8")).toBe(
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123\n",
    );
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("cleans exact paths and warns when TERM interrupts a started remote apply", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
create_remote_upload_path() { printf '%s' '/opt/gooes-dev/docker/.douyin-env-upload.ABC123'; }
copy_remote_payload() { return 0; }
run_remote_apply() { kill -TERM "$$"; }
cleanup_remote_upload() { printf '%s\\n' "$1" > "$TEST_ROOT/remote-cleanup"; }
`);

    expect(context.result.exitCode).toBe(143);
    expect(readFileSync(join(context.root, "remote-cleanup"), "utf8")).toBe(
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123\n",
    );
    expect(targetUpdateWarningCount(context.result)).toBe(1);
    expect(context.result.stdout).toContain("local_cleanup=true\n");
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("makes cleanup failure fatal and warns after remote apply started", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
create_remote_upload_path() { printf '%s' '/opt/gooes-dev/docker/.douyin-env-upload.ABC123'; }
copy_remote_payload() { return 0; }
run_remote_apply() { printf '%s\\n' 'remote_cleanup=true'; }
cleanup_remote_upload() { return 1; }
`);

    expect(context.result.exitCode).toBe(74);
    expect(context.result.stderr).toContain("CLEANUP_FAILED\n");
    expect(targetUpdateWarningCount(context.result)).toBe(1);
    expect(existsSync(context.workDir)).toBe(false);
    expectNoEntrySecrets(context.result);
  });

  test("never broad-deletes an unexpected local workdir entry", () => {
    const context = runEntryWorkflow(`
${ENTRY_VALID_INPUT_AND_RANDOM_OVERRIDES}
create_remote_upload_path() { printf '%s' '/opt/gooes-dev/docker/.douyin-env-upload.ABC123'; }
copy_remote_payload() { : > "$WORK_DIR/unexpected-entry"; }
run_remote_apply() { printf '%s\\n' 'remote_cleanup=true'; }
cleanup_remote_upload() { return 0; }
`);

    expect(context.result.exitCode).toBe(74);
    expect(context.result.stderr).toContain("CLEANUP_FAILED\n");
    expect(targetUpdateWarningCount(context.result)).toBe(1);
    expect(existsSync(join(context.workDir, "unexpected-entry"))).toBe(true);
    expect(existsSync(join(context.workDir, "douyin.env.payload"))).toBe(false);
    expectNoEntrySecrets(context.result);
  });
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
});

describe("remote douyin env transaction failures", () => {
  afterEach(cleanupRemoteTemporaryRoots);

  const insecureFileCases: ReadonlyArray<{
    readonly name: string;
    readonly expectedCode:
      | "REMOTE_TARGET_STATE_INVALID"
      | "REMOTE_PAYLOAD_INVALID";
    readonly functionOverrides?: string;
    readonly prepare?: (paths: RemoteHarnessPaths) => void;
  }> = [
    {
      name: "target symlink",
      expectedCode: "REMOTE_TARGET_STATE_INVALID",
      prepare: (paths) => {
        const sourcePath = join(paths.root, "target-source.env");
        writeFileSync(sourcePath, paths.original, { mode: 0o600 });
        chmodSync(sourcePath, 0o600);
        rmSync(paths.targetFile);
        symlinkSync(sourcePath, paths.targetFile);
      },
    },
    {
      name: "target directory symlink",
      expectedCode: "REMOTE_TARGET_STATE_INVALID",
      prepare: (paths) => {
        const realTargetDir = join(paths.root, "real-docker");
        renameSync(paths.targetDir, realTargetDir);
        symlinkSync(realTargetDir, paths.targetDir, "dir");
      },
    },
    {
      name: "payload symlink",
      expectedCode: "REMOTE_PAYLOAD_INVALID",
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
      expectedCode: "REMOTE_TARGET_STATE_INVALID",
      prepare: (paths) => chmodSync(paths.targetFile, 0o644),
    },
    {
      name: "payload mode 0644",
      expectedCode: "REMOTE_PAYLOAD_INVALID",
      prepare: (paths) => chmodSync(paths.payloadFile, 0o644),
    },
    {
      name: "injected wrong target owner",
      expectedCode: "REMOTE_TARGET_STATE_INVALID",
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
      expectedCode: "REMOTE_PAYLOAD_INVALID",
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
    ({ expectedCode, functionOverrides, name, prepare }) => {
      const harness = runRemoteTransaction({ functionOverrides, prepare });

      expectRedactedFailure(harness.result, expectedCode);
      expectFileBytes(harness.targetFile, harness.original);
      if (name === "target symlink") {
        expect(lstatSync(harness.targetFile).isSymbolicLink()).toBe(true);
      }
      if (name === "target directory symlink") {
        expect(lstatSync(harness.targetDir).isSymbolicLink()).toBe(true);
      }
    },
  );

  const candidateTempCases = [
    { name: "candidate", templateToken: ".douyin-env-candidate." },
    { name: "before view", templateToken: ".douyin-env-before." },
    { name: "after view", templateToken: ".douyin-env-after." },
    { name: "target block", templateToken: ".douyin-env-target-block." },
  ] as const;

  test.each(candidateTempCases)(
    "rejects an insecure $name temp before any write-producing helper runs",
    ({ templateToken }) => {
      const writeProbeName = ".temp-write-producing-helper-ran";
      const functionOverrides = [
        "create_transaction_temp() {",
        '  local variable_name="$1"',
        '  local template="$2"',
        "  local temp_path",
        '  temp_path="$(mktemp "$template")" || return 1',
        '  printf -v "$variable_name" \'%s\' "$temp_path"',
        `  if [[ "$template" == *"${templateToken}"* ]]; then`,
        '    command install -m 644 /dev/null "$temp_path" >/dev/null 2>&1',
        "  else",
        '    command install -m 600 /dev/null "$temp_path" >/dev/null 2>&1',
        "  fi",
        "}",
        "filter_non_target() {",
        `  : > "$TARGET_DIR/${writeProbeName}"`,
        "  return 1",
        "}",
      ].join("\n");
      const harness = runRemoteTransaction({ functionOverrides });

      expectRedactedFailure(harness.result, "REMOTE_CANDIDATE_INVALID");
      expectFileBytes(harness.targetFile, harness.original);
      expectValidBackup(harness);
      expect(existsSync(join(harness.targetDir, writeProbeName))).toBe(false);
      expect(targetUpdateWarningCount(harness.result)).toBe(0);
      expectNoRemoteTransactionTemps(harness.targetDir);
    },
  );

  test("rejects an insecure restore temp before copying backup bytes", () => {
    const copyProbeName = ".temp-backup-copy-ran";
    const functionOverrides = [
      "create_transaction_temp() {",
      '  local variable_name="$1"',
      '  local template="$2"',
      "  local temp_path",
      '  temp_path="$(mktemp "$template")" || return 1',
      '  printf -v "$variable_name" \'%s\' "$temp_path"',
      '  if [[ "$template" == *".douyin-env-restore."* ]]; then',
      '    command install -m 644 /dev/null "$temp_path" >/dev/null 2>&1',
      "  else",
      '    command install -m 600 /dev/null "$temp_path" >/dev/null 2>&1',
      "  fi",
      "}",
      "install() {",
      '  if [[ "$#" -eq 4 && "$1" == "-m" && "$3" == "$BACKUP_PATH" ]]; then',
      `    : > "$TARGET_DIR/${copyProbeName}"`,
      "  fi",
      '  command install "$@"',
      "}",
      "verify_post_move() { return 1; }",
    ].join("\n");
    const harness = runRemoteTransaction({ functionOverrides });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);

    expectRedactedFailure(harness.result, "REMOTE_ROLLBACK_FAILED");
    expectFileBytes(harness.targetFile, expectedTarget);
    expectValidBackup(harness);
    expect(existsSync(join(harness.targetDir, copyProbeName))).toBe(false);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
    expectNoRemoteTransactionTemps(harness.targetDir);
  });

  test.each(candidateTempCases)(
    "revalidates the $name temp after its write step",
    ({ templateToken }) => {
      const modeCheckProbeName = ".temp-mode-check-seen";
      const functionOverrides = [
        "file_mode() {",
        '  local path="$1"',
        `  if [[ "$path" == *"${templateToken}"* ]]; then`,
        `    if [[ -e "$TARGET_DIR/${modeCheckProbeName}" ]]; then`,
        "      printf '%s\\n' '644'",
        "    else",
        `      : > "$TARGET_DIR/${modeCheckProbeName}"`,
        "      printf '%s\\n' '600'",
        "    fi",
        "    return 0",
        "  fi",
        "  printf '%s\\n' '600'",
        "}",
      ].join("\n");
      const harness = runRemoteTransaction({ functionOverrides });

      expectRedactedFailure(harness.result, "REMOTE_CANDIDATE_INVALID");
      expectFileBytes(harness.targetFile, harness.original);
      expectValidBackup(harness);
      expect(targetUpdateWarningCount(harness.result)).toBe(0);
    },
  );

  test("revalidates the restore temp after copying backup bytes", () => {
    const modeCheckProbeName = ".restore-temp-mode-check-seen";
    const functionOverrides = [
      "file_mode() {",
      '  local path="$1"',
      '  if [[ "$path" == *"/.douyin-env-restore."* ]]; then',
      `    if [[ -e "$TARGET_DIR/${modeCheckProbeName}" ]]; then`,
      "      printf '%s\\n' '644'",
      "    else",
      `      : > "$TARGET_DIR/${modeCheckProbeName}"`,
      "      printf '%s\\n' '600'",
      "    fi",
      "    return 0",
      "  fi",
      "  printf '%s\\n' '600'",
      "}",
      "verify_post_move() { return 1; }",
    ].join("\n");
    const harness = runRemoteTransaction({ functionOverrides });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);

    expectRedactedFailure(harness.result, "REMOTE_ROLLBACK_FAILED");
    expectFileBytes(harness.targetFile, expectedTarget);
    expectValidBackup(harness);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
  });

  const invalidTargetTextCases = [
    { name: "carriage return", original: "BASE=value\r\n" },
    { name: "NUL byte", original: "BASE=value\0\n" },
  ] as const;

  test.each(invalidTargetTextCases)(
    "rejects existing target text containing $name before backup",
    ({ original }) => {
      const harness = runRemoteTransaction({ original });

      expectRedactedFailure(harness.result, "REMOTE_TARGET_STATE_INVALID");
      expectFileBytes(harness.targetFile, harness.original);
      expectTargetKeyRecordCount(harness.targetFile, 0);
      expect(findBackupNames(harness.targetDir)).toEqual([]);
    },
  );

  test("rejects a failing pre-move hook without replacing the target", () => {
    const harness = runRemoteTransaction({
      functionOverrides: "before_atomic_move() { return 1; }",
    });

    expectRedactedFailure(harness.result, "REMOTE_CANDIDATE_INVALID");
    expectFileBytes(harness.targetFile, harness.original);
    expectValidBackup(harness);
    expect(targetUpdateWarningCount(harness.result)).toBe(0);
  });

  test("detects a target mutation made by the pre-move hook", () => {
    const externalChange = Buffer.from("EXTERNAL=change\n", "utf8");
    const harness = runRemoteTransaction({
      functionOverrides: [
        "before_atomic_move() {",
        "  printf '%s\\n' 'EXTERNAL=change' >> \"$TARGET_FILE\"",
        "  return 0",
        "}",
      ].join("\n"),
    });

    expectRedactedFailure(harness.result, "REMOTE_CONCURRENT_CHANGE");
    expectFileBytes(
      harness.targetFile,
      Buffer.concat([harness.original, externalChange]),
    );
    expectValidBackup(harness);
    expect(targetUpdateWarningCount(harness.result)).toBe(0);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
  });

  test("atomically restores the original target after post-move verification fails", () => {
    const harness = runRemoteTransaction({
      functionOverrides: "verify_post_move() { return 1; }",
    });

    expectRedactedFailure(harness.result, "REMOTE_APPLY_FAILED");
    expectFileBytes(harness.targetFile, harness.original);
    expectMode600(harness.targetFile);
    expectValidBackup(harness);
    expect(harness.result.stdout).toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(0);
    expectNoRemoteTransactionTemps(harness.targetDir);
  });

  test("reports rollback failure once and cleans only recorded temp paths", () => {
    const decoyNames = [
      ".douyin-env-upload.keep",
      ".douyin-env-candidate.keep",
      ".douyin-env-before.keep",
      ".douyin-env-after.keep",
      ".douyin-env-target-block.keep",
      ".douyin-env-restore.keep",
    ] as const;
    const decoyBytes = Buffer.from("test-decoy-must-remain\n", "utf8");
    const harness = runRemoteTransaction({
      functionOverrides: [
        "verify_post_move() { return 1; }",
        "restore_target_from_backup() { return 1; }",
      ].join("\n"),
      prepare: (paths) => {
        for (const name of decoyNames) {
          writeFileSync(join(paths.targetDir, name), decoyBytes, {
            mode: 0o600,
          });
        }
      },
    });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);

    expectRedactedFailure(harness.result, "REMOTE_ROLLBACK_FAILED");
    expectFileBytes(harness.targetFile, expectedTarget);
    expectValidBackup(harness);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
    for (const name of decoyNames) {
      expectFileBytes(join(harness.targetDir, name), decoyBytes);
    }
    expectNoRemoteTransactionTemps(harness.targetDir, decoyNames);
  });

  test("does not roll back a post-move external target mutation", () => {
    const externalChange = Buffer.from(
      "EXTERNAL_AFTER_MOVE=change\n",
      "utf8",
    );
    const harness = runRemoteTransaction({
      functionOverrides: [
        "verify_post_move() {",
        "  printf '%s\\n' 'EXTERNAL_AFTER_MOVE=change' >> \"$1\"",
        "  return 1",
        "}",
      ].join("\n"),
    });
    const expectedTarget = Buffer.concat([
      harness.original,
      harness.payload,
      externalChange,
    ]);

    expectRedactedFailure(harness.result, "REMOTE_CONCURRENT_CHANGE");
    expectFileBytes(harness.targetFile, expectedTarget);
    expectTargetKeyRecordCount(harness.targetFile, 1);
    expectValidBackup(harness);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
  });

  test("does not roll back a same-content post-move mode change", () => {
    const harness = runRemoteTransaction({
      functionOverrides: [
        "verify_post_move() {",
        '  chmod 644 "$1"',
        "  return 1",
        "}",
      ].join("\n"),
    });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);

    expectRedactedFailure(harness.result, "REMOTE_CONCURRENT_CHANGE");
    expectFileBytes(harness.targetFile, expectedTarget);
    expect(statSync(harness.targetFile).mode & 0o7777).toBe(0o644);
    expectValidBackup(harness);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
  });

  test("does not roll back a same-bytes post-move inode replacement", () => {
    const identityLinkName = ".external-replacement-identity";
    const functionOverrides = [
      "verify_post_move() {",
      '  local replacement="$TARGET_DIR/.external-same-bytes-replacement"',
      `  local identity_link="$TARGET_DIR/${identityLinkName}"`,
      '  cp "$1" "$replacement"',
      '  chmod 600 "$replacement"',
      '  ln "$replacement" "$identity_link"',
      '  mv "$replacement" "$1"',
      "  return 1",
      "}",
    ].join("\n");
    const harness = runRemoteTransaction({ functionOverrides });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);
    const identityLink = join(harness.targetDir, identityLinkName);

    expectRedactedFailure(harness.result, "REMOTE_CONCURRENT_CHANGE");
    expectFileBytes(harness.targetFile, expectedTarget);
    expect(statSync(harness.targetFile).ino).toBe(statSync(identityLink).ino);
    expectValidBackup(harness);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
  });

  test("does not overwrite content changed during restore candidate construction", () => {
    const externalChange = Buffer.from(
      "EXTERNAL_DURING_RESTORE=change\n",
      "utf8",
    );
    const functionOverrides = [
      "verify_post_move() { return 1; }",
      "install() {",
      '  if [[ "$#" -eq 4 && "$1" == "-m" && "$3" == "$BACKUP_PATH" ]]; then',
      '    command install "$@" || return 1',
      "    printf '%s\\n' 'EXTERNAL_DURING_RESTORE=change' >> \"$TARGET_FILE\" || return 1",
      "    return 0",
      "  fi",
      '  command install "$@"',
      "}",
    ].join("\n");
    const harness = runRemoteTransaction({ functionOverrides });
    const expectedTarget = Buffer.concat([
      harness.original,
      harness.payload,
      externalChange,
    ]);

    expectRedactedFailure(harness.result, "REMOTE_CONCURRENT_CHANGE");
    expectFileBytes(harness.targetFile, expectedTarget);
    expectTargetKeyRecordCount(harness.targetFile, 1);
    expectValidBackup(harness);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
    expectNoRemoteTransactionTemps(harness.targetDir);
  });

  test("does not overwrite a same-bytes inode replacement during restore candidate construction", () => {
    const identityLinkName = ".external-during-restore-identity";
    const functionOverrides = [
      "verify_post_move() { return 1; }",
      "install() {",
      '  if [[ "$#" -eq 4 && "$1" == "-m" && "$3" == "$BACKUP_PATH" ]]; then',
      '    local replacement="$TARGET_DIR/.external-during-restore-replacement"',
      `    local identity_link="$TARGET_DIR/${identityLinkName}"`,
      '    command install "$@" || return 1',
      '    cp "$TARGET_FILE" "$replacement" || return 1',
      '    chmod 600 "$replacement" || return 1',
      '    ln "$replacement" "$identity_link" || return 1',
      '    mv "$replacement" "$TARGET_FILE" || return 1',
      "    return 0",
      "  fi",
      '  command install "$@"',
      "}",
    ].join("\n");
    const harness = runRemoteTransaction({ functionOverrides });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);
    const identityLink = join(harness.targetDir, identityLinkName);

    expectRedactedFailure(harness.result, "REMOTE_CONCURRENT_CHANGE");
    expectFileBytes(harness.targetFile, expectedTarget);
    expect(statSync(harness.targetFile).ino).toBe(statSync(identityLink).ino);
    expectValidBackup(harness);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
    expectNoRemoteTransactionTemps(harness.targetDir);
  });

  test("does not warn about target uncertainty when cleanup fails after verified rollback", () => {
    const functionOverrides = [
      "verify_post_move() { return 1; }",
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

    expectRedactedFailure(harness.result, "CLEANUP_FAILED");
    expect(harness.result.stderr).toContain("REMOTE_APPLY_FAILED\n");
    expect(harness.result.stdout).toContain("rollback_restored=true\n");
    expectFileBytes(harness.targetFile, harness.original);
    expectMode600(harness.targetFile);
    expectValidBackup(harness);
    expect(existsSync(harness.payloadFile)).toBe(true);
    expect(targetUpdateWarningCount(harness.result)).toBe(0);
  });

  test("keeps a verified new target when the container identity changes", () => {
    const functionOverrides = [
      "container_snapshot() {",
      '  local marker="$TARGET_DIR/.container-snapshot-test-marker"',
      '  if [[ ! -e "$marker" ]]; then',
      '    : > "$marker"',
      "    printf '%s\\n' 'fixed-id|fixed-start|fixed-image|healthy'",
      "    return 0",
      "  fi",
      "  printf '%s\\n' 'changed-id|fixed-start|fixed-image|healthy'",
      "}",
    ].join("\n");
    const harness = runRemoteTransaction({ functionOverrides });
    const expectedTarget = Buffer.concat([harness.original, harness.payload]);

    expectRedactedFailure(harness.result, "REMOTE_CONTAINER_CHANGED");
    expectFileBytes(harness.targetFile, expectedTarget);
    expectTargetKeyRecordCount(harness.targetFile, 1);
    expectMode600(harness.targetFile);
    expectValidBackup(harness);
    expect(harness.result.stdout).not.toContain("rollback_restored=true\n");
    expect(targetUpdateWarningCount(harness.result)).toBe(1);
  });

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
