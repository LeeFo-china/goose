import { createHash } from "node:crypto";

import {
  createRedactedEnvRecord,
  type RedactedPlatformConfigRecord,
} from "./platform-config-audit-core";
import {
  getEnvironmentDefinition,
  type PlatformAuditEnvironment,
} from "./platform-config-audit-remote";

export const WECHAT_MINI_APPLY_KEY = "WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1";

export interface PlatformConfigSyncApplyInput {
  readonly key: typeof WECHAT_MINI_APPLY_KEY;
  readonly expectedSha256: string;
}

export interface PlatformConfigSyncApplyResult {
  readonly key: typeof WECHAT_MINI_APPLY_KEY;
  readonly source: {
    readonly byte_length: number;
    readonly sha256: string;
  };
  readonly production_before: RedactedPlatformConfigRecord | null;
  readonly production_after: RedactedPlatformConfigRecord;
  readonly backup_path: string;
  readonly restart_required: true;
}

interface RawSecretEnvelope {
  readonly key: string;
  readonly value_base64: string;
  readonly byte_length: number;
  readonly sha256: string;
}

export async function applyWechatMiniSessionKey(
  input: PlatformConfigSyncApplyInput,
): Promise<PlatformConfigSyncApplyResult> {
  const source = await readRemoteSecret("dev", input.key);
  if (source.sha256 !== input.expectedSha256) {
    throw new Error("PLATFORM_CONFIG_SYNC_SOURCE_CHANGED");
  }

  const productionResult = await writeRemoteSecret("production", source);
  if (productionResult.production_after.sha256 !== input.expectedSha256) {
    throw new Error("PLATFORM_CONFIG_SYNC_APPLY_VERIFY_FAILED");
  }

  return productionResult;
}

export function buildRemoteEnvValueReadCommand(
  environment: PlatformAuditEnvironment,
  key: typeof WECHAT_MINI_APPLY_KEY,
): string {
  const definition = getEnvironmentDefinition(environment);
  return [
    "set -euo pipefail",
    `TARGET_ENV_FILE=${shellQuote(definition.envFile)}`,
    `TARGET_KEY=${shellQuote(key)}`,
    "export TARGET_ENV_FILE TARGET_KEY",
    `python3 -c ${shellQuote(REMOTE_READ_SECRET_PYTHON)}`,
  ].join("\n");
}

export function buildRemoteEnvFileKeyApplyCommand(
  environment: "production",
  key: typeof WECHAT_MINI_APPLY_KEY,
): string {
  const definition = getEnvironmentDefinition(environment);
  return [
    "set -euo pipefail",
    "umask 077",
    `TARGET_ENV_FILE=${shellQuote(definition.envFile)}`,
    `TARGET_KEY=${shellQuote(key)}`,
    "PAYLOAD_FILE=$(mktemp /tmp/gooes-platform-config-sync.XXXXXX)",
    "cleanup() { rm -f \"$PAYLOAD_FILE\"; }",
    "trap cleanup EXIT",
    "cat > \"$PAYLOAD_FILE\"",
    "export TARGET_ENV_FILE TARGET_KEY PAYLOAD_FILE",
    `python3 -c ${shellQuote(REMOTE_APPLY_SECRET_PYTHON)}`,
  ].join("\n");
}

async function readRemoteSecret(
  environment: "dev",
  key: typeof WECHAT_MINI_APPLY_KEY,
): Promise<RawSecretEnvelope> {
  const definition = getEnvironmentDefinition(environment);
  const result = await runSshCommand({
    host: definition.host,
    command: buildRemoteEnvValueReadCommand(environment, key),
  });
  if (result.exitCode !== 0) {
    throw new Error("PLATFORM_CONFIG_SYNC_SOURCE_READ_FAILED");
  }

  return parseRawSecretEnvelope(result.stdout, key);
}

async function writeRemoteSecret(
  environment: "production",
  source: RawSecretEnvelope,
): Promise<PlatformConfigSyncApplyResult> {
  const definition = getEnvironmentDefinition(environment);
  const result = await runSshCommand({
    host: definition.host,
    command: buildRemoteEnvFileKeyApplyCommand(environment, WECHAT_MINI_APPLY_KEY),
    stdin: `${JSON.stringify(source)}\n`,
  });
  if (result.exitCode !== 0) {
    throw new Error("PLATFORM_CONFIG_SYNC_TARGET_WRITE_FAILED");
  }

  return parseApplyResult(result.stdout);
}

async function runSshCommand(input: {
  readonly host: string;
  readonly command: string;
  readonly stdin?: string;
}): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const process = Bun.spawn(["ssh", input.host, `bash -lc ${shellQuote(input.command)}`], {
    stdin: input.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (input.stdin !== undefined) {
    process.stdin.write(input.stdin);
    process.stdin.end();
  }

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function parseRawSecretEnvelope(
  stdout: string,
  expectedKey: typeof WECHAT_MINI_APPLY_KEY,
): RawSecretEnvelope {
  const parsed = JSON.parse(stdout) as Partial<RawSecretEnvelope>;
  if (
    parsed.key !== expectedKey ||
    typeof parsed.value_base64 !== "string" ||
    typeof parsed.byte_length !== "number" ||
    typeof parsed.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(parsed.sha256)
  ) {
    throw new Error("PLATFORM_CONFIG_SYNC_SOURCE_INVALID");
  }
  return {
    key: parsed.key,
    value_base64: parsed.value_base64,
    byte_length: parsed.byte_length,
    sha256: parsed.sha256,
  };
}

function parseApplyResult(stdout: string): PlatformConfigSyncApplyResult {
  const parsed = JSON.parse(stdout) as Partial<PlatformConfigSyncApplyResult>;
  if (
    parsed.key !== WECHAT_MINI_APPLY_KEY ||
    typeof parsed.backup_path !== "string" ||
    parsed.restart_required !== true ||
    !parsed.source ||
    typeof parsed.source.byte_length !== "number" ||
    typeof parsed.source.sha256 !== "string" ||
    !parsed.production_after ||
    parsed.production_after.key !== WECHAT_MINI_APPLY_KEY ||
    parsed.production_after.sha256 !== parsed.source.sha256
  ) {
    throw new Error("PLATFORM_CONFIG_SYNC_TARGET_RESPONSE_INVALID");
  }
  return {
    key: WECHAT_MINI_APPLY_KEY,
    source: parsed.source,
    production_before: parsed.production_before ?? null,
    production_after: parsed.production_after,
    backup_path: parsed.backup_path,
    restart_required: true,
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

const REMOTE_READ_SECRET_PYTHON = String.raw`
import base64
import hashlib
import json
import os
import sys

env_file = os.environ["TARGET_ENV_FILE"]
target_key = os.environ["TARGET_KEY"]
value = None

with open(env_file, "r", encoding="utf-8") as handle:
    for raw_line in handle:
        line = raw_line.rstrip("\n")
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, candidate = line.split("=", 1)
        if key == target_key:
            value = candidate
            break

if value is None or value == "":
    print("PLATFORM_CONFIG_SYNC_SOURCE_KEY_MISSING", file=sys.stderr)
    raise SystemExit(2)

encoded = value.encode("utf-8")
print(json.dumps({
    "key": target_key,
    "value_base64": base64.b64encode(encoded).decode("ascii"),
    "byte_length": len(encoded),
    "sha256": hashlib.sha256(encoded).hexdigest(),
}, separators=(",", ":")))
`.trim();

const REMOTE_APPLY_SECRET_PYTHON = String.raw`
import base64
import datetime
import hashlib
import json
import os
import stat
import sys

env_file = os.environ["TARGET_ENV_FILE"]
target_key = os.environ["TARGET_KEY"]
payload_path = os.environ["PAYLOAD_FILE"]
with open(payload_path, "r", encoding="utf-8") as payload_handle:
    payload = json.loads(payload_handle.read())

if payload.get("key") != target_key:
    print("PLATFORM_CONFIG_SYNC_TARGET_KEY_MISMATCH", file=sys.stderr)
    raise SystemExit(2)

raw_value = base64.b64decode(payload["value_base64"], validate=True).decode("utf-8")
if raw_value == "" or "\n" in raw_value or "\r" in raw_value:
    print("PLATFORM_CONFIG_SYNC_TARGET_VALUE_INVALID", file=sys.stderr)
    raise SystemExit(2)

encoded_value = raw_value.encode("utf-8")
sha256 = hashlib.sha256(encoded_value).hexdigest()
if sha256 != payload.get("sha256"):
    print("PLATFORM_CONFIG_SYNC_TARGET_HASH_MISMATCH", file=sys.stderr)
    raise SystemExit(2)

with open(env_file, "rb") as handle:
    original_bytes = handle.read()

env_stat = os.stat(env_file)
env_dir = os.path.dirname(env_file)
timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
backup_path = f"{env_file}.backup-platform-config-{timestamp}"
backup_fd = os.open(backup_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(backup_fd, "wb") as handle:
    handle.write(original_bytes)
os.chown(backup_path, env_stat.st_uid, env_stat.st_gid)

original_text = original_bytes.decode("utf-8")
lines = original_text.splitlines(True)
replacement_line = f"{target_key}={raw_value}\n"
updated_lines = []
replaced = False
before_value = None
for line in lines:
    stripped = line.rstrip("\n")
    if not stripped.lstrip().startswith("#") and stripped.startswith(f"{target_key}="):
        if before_value is None:
            before_value = stripped.split("=", 1)[1]
        if not replaced:
            updated_lines.append(replacement_line)
            replaced = True
        continue
    updated_lines.append(line)

if not replaced:
    if updated_lines and not updated_lines[-1].endswith("\n"):
        updated_lines[-1] = f"{updated_lines[-1]}\n"
    updated_lines.append(replacement_line)

updated_bytes = "".join(updated_lines).encode("utf-8")
temp_path = os.path.join(env_dir, f".{os.path.basename(env_file)}.platform-config-sync.{os.getpid()}.tmp")
temp_fd = os.open(temp_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, stat.S_IMODE(env_stat.st_mode) or 0o600)
try:
    with os.fdopen(temp_fd, "wb") as handle:
        handle.write(updated_bytes)
    os.chown(temp_path, env_stat.st_uid, env_stat.st_gid)
    os.chmod(temp_path, stat.S_IMODE(env_stat.st_mode) or 0o600)
    os.replace(temp_path, env_file)
finally:
    if os.path.exists(temp_path):
        os.unlink(temp_path)

def redacted_record(value):
    if value is None or value == "":
        return None
    return {
        "key": target_key,
        "class": "MUST_MATCH",
        "present": True,
        "byte_length": len(value.encode("utf-8")),
        "sha256": hashlib.sha256(value.encode("utf-8")).hexdigest(),
        "public_tail": None,
    }

print(json.dumps({
    "key": target_key,
    "source": {
        "byte_length": len(encoded_value),
        "sha256": sha256,
    },
    "production_before": redacted_record(before_value),
    "production_after": redacted_record(raw_value),
    "backup_path": backup_path,
    "restart_required": True,
}, separators=(",", ":")))
`.trim();

export function createLocalApplyResultForTest(
  key: typeof WECHAT_MINI_APPLY_KEY,
  value: string,
): PlatformConfigSyncApplyResult {
  return {
    key,
    source: {
      byte_length: Buffer.byteLength(value, "utf8"),
      sha256: createHash("sha256").update(value, "utf8").digest("hex"),
    },
    production_before: null,
    production_after: createRedactedEnvRecord(key, value),
    backup_path: "/tmp/.env.api.backup-platform-config-test",
    restart_required: true,
  };
}
