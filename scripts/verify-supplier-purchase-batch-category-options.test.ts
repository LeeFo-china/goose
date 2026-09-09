import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const runner = join(
  repositoryRoot,
  "scripts/verify-supplier-purchase-batch-category-options.sh",
);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runState(input: {
  ledgerTable: boolean;
  applied: boolean;
  functionExists: boolean;
  failQuery?: boolean;
}) {
  const directory = mkdtempSync(join(tmpdir(), "category-option-runner-"));
  temporaryDirectories.push(directory);
  const stateFile = join(directory, "function-state");
  const logFile = join(directory, "docker.log");
  writeFileSync(stateFile, input.functionExists ? "1" : "0");
  const docker = join(directory, "docker");
  writeFileSync(docker, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "inspect" ]]; then exit 0; fi
args="$*"
stdin_payload="$(cat)"
printf '%s\n' "$args" >> "$FAKE_LOG_FILE"
if [[ "$args" == *"to_regclass('supabase_migrations.schema_migrations')"* ]]; then
  if [[ "\${FAKE_FAIL_QUERY:-0}" == "1" ]]; then exit 7; fi
  if [[ "$FAKE_LEDGER_TABLE" == "1" ]]; then
    printf '%s\n' 'supabase_migrations.schema_migrations'
  fi
  exit 0
fi
if [[ "$args" == *"from supabase_migrations.schema_migrations"* ]]; then
  printf '%s\n' "$FAKE_APPLIED"
  exit 0
fi
if [[ "$args" == *"supabase_migrations.schema_migrations"* && \( \
  "$args" == *"insert"* || "$args" == *"update"* || "$args" == *"delete"* \
\) ]]; then
  printf '%s\n' 'ledger-write' >> "$FAKE_LOG_FILE"
  exit 9
fi
if [[ "$args" == *"to_regprocedure("* ]]; then
  if [[ "$(< "$FAKE_STATE_FILE")" == "1" ]]; then
    printf '%s\n' 'resolve_supplier_purchase_batch_category_options(uuid,timestamp with time zone,text,integer,integer)'
  fi
  exit 0
fi
if [[ "$args" == *"DROP FUNCTION"* ]]; then
  printf '%s\n' 'drop' >> "$FAKE_LOG_FILE"
  printf '0' > "$FAKE_STATE_FILE"
  exit 0
fi
if [[ "$args" == *"category-option-fixture-%"* ]]; then
  printf '%s\n' '0'
  exit 0
fi
if [[ "$stdin_payload" == *"CREATE FUNCTION public.resolve_supplier_purchase_batch_category_options"* ]]; then
  printf '%s\n' 'apply' >> "$FAKE_LOG_FILE"
  printf '1' > "$FAKE_STATE_FILE"
  exit 0
fi
if [[ "$stdin_payload" == *"category-options integration assertions passed"* ]]; then
  printf '%s\n' 'test' >> "$FAKE_LOG_FILE"
  exit 0
fi
exit 0
`);
  chmodSync(docker, 0o755);

  const result = spawnSync("bash", [runner], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      FAKE_LOG_FILE: logFile,
      FAKE_STATE_FILE: stateFile,
      FAKE_LEDGER_TABLE: input.ledgerTable ? "1" : "0",
      FAKE_APPLIED: input.applied ? "1" : "0",
      FAKE_FAIL_QUERY: input.failQuery ? "1" : "0",
    },
  });
  return {
    ...result,
    log: readFileSync(logFile, "utf8"),
    functionExists: readFileSync(stateFile, "utf8") === "1",
  };
}

describe("supplier purchase batch category options SQL runner", () => {
  test("uses an applied function without recreating, dropping, or changing ledger", () => {
    const result = runState({
      ledgerTable: true,
      applied: true,
      functionExists: true,
    });

    expect(result.status).toBe(0);
    expect(result.log).toContain("test");
    expect(result.log).not.toContain("apply");
    expect(result.log).not.toContain("drop");
    expect(result.log).not.toContain("ledger-write");
    expect(result.functionExists).toBe(true);
  });

  test("temporarily applies and precisely cleans only a zero-zero state", () => {
    const result = runState({
      ledgerTable: true,
      applied: false,
      functionExists: false,
    });

    expect(result.status).toBe(0);
    expect(result.log).toContain("apply");
    expect(result.log).toContain("test");
    expect(result.log).toContain("drop");
    expect(result.log).not.toContain("ledger-write");
    expect(result.functionExists).toBe(false);
  });

  test("treats an absent migration ledger table as not applied", () => {
    const result = runState({
      ledgerTable: false,
      applied: false,
      functionExists: false,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("ledger table is absent");
    expect(result.log).toContain("apply");
    expect(result.functionExists).toBe(false);
  });

  test("fails closed for both schema drift combinations without mutation", () => {
    for (const state of [
      { applied: true, functionExists: false },
      { applied: false, functionExists: true },
    ]) {
      const result = runState({ ledgerTable: true, ...state });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("schema drift");
      expect(result.log).not.toContain("apply");
      expect(result.log).not.toContain("drop");
      expect(result.log).not.toContain("test");
      expect(result.functionExists).toBe(state.functionExists);
    }
  });

  test("does not swallow a real ledger connection or query failure", () => {
    const result = runState({
      ledgerTable: true,
      applied: false,
      functionExists: false,
      failQuery: true,
    });

    expect(result.status).toBe(7);
    expect(result.log).not.toContain("apply");
    expect(result.log).not.toContain("drop");
    expect(result.functionExists).toBe(false);
  });
});
