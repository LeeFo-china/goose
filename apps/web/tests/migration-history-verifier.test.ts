import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const script = new URL("../../../scripts/verify-migration-history.mjs", import.meta.url).pathname;
const target = "20260711120000";
const older = "20260710120000";

function table(rows: string[], ansi = false): string {
  const header = " Local          | Remote         | Time (UTC)";
  return [
    "Connecting to remote database...",
    ansi ? `\u001b[1m${header}\u001b[0m` : header,
    "----------------|----------------|---------------------",
    ...rows,
    "",
  ].join("\n");
}

function verify(history: string, localVersions = [older, target]) {
  const root = mkdtempSync(join(tmpdir(), "migration-history-"));
  const migrations = join(root, "migrations");
  const historyFile = join(root, "history.txt");
  mkdirSync(migrations);
  for (const version of localVersions) {
    writeFileSync(join(migrations, `${version}_fixture.sql`), "-- fixture");
  }
  writeFileSync(historyFile, history);
  return Bun.spawnSync(["node", script, historyFile, migrations, target], { stderr: "pipe" });
}

describe("Supabase CLI migration table verifier", () => {
  test("accepts a complete aligned table and strips ANSI", () => {
    const result = verify(table([
      ` ${older} | ${older} | 2026-07-10 12:00:00`,
      ` ${target} | ${target} | 2026-07-11 12:00:00`,
    ], true));
    expect(result.exitCode).toBe(0);
  });

  test.each([
    table([` ${older} | ${older} | 2026-07-10 12:00:00`, ` ${target} |                |`]),
    table([` ${older} | ${older} | 2026-07-10 12:00:00`, `                | ${target} |`]),
    table([` ${older} | ${older} | 2026-07-10 12:00:00`]),
    table([` ${older} | ${older} | 2026-07-10 12:00:00`, ` 20260712120000 | 20260712120000 | 2026-07-12 12:00:00`]),
    table([` ${target} | ${target} | 2026-07-11 12:00:00`]),
    table([` ${target} | ${target} | 2026-07-11 12:00:00`, "unexpected output"]),
    table([` ${target} | ${target} | 2026-07-11 12:00:00`, ` ${target} | ${target} | 2026-07-11 12:00:00`]),
    table([` ${target} | ${target} | 2026-07-11 12:00:00`, ` ${older} | ${older} | 2026-07-10 12:00:00`]),
  ])("fails closed for incomplete, extra, malformed, duplicate, or unordered output %#", (history) => {
    expect(verify(history).exitCode).toBe(1);
  });
});
