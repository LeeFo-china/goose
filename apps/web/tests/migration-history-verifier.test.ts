import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const script = new URL("../../../scripts/verify-migration-history.mjs", import.meta.url).pathname;

function verify(rows: unknown[]) {
  const file = join(mkdtempSync(join(tmpdir(), "migration-history-")), "history.json");
  writeFileSync(file, JSON.stringify(rows));
  return Bun.spawnSync(["node", script, file, "20260711120000"], { stderr: "pipe" });
}

describe("migration history verifier", () => {
  test("accepts an aligned Local/Remote history containing the target", () => {
    expect(verify([{ local: "20260711120000", remote: "20260711120000" }]).exitCode).toBe(0);
  });
  test("rejects mismatch and missing target histories", () => {
    expect(verify([{ local: "20260711120000", remote: null }]).exitCode).toBe(1);
    expect(verify([{ local: "20260710120000", remote: "20260710120000" }]).exitCode).toBe(1);
  });
});
