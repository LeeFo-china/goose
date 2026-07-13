import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "bun:test";

const script = new URL(
  "../../../scripts/verify-dev-migration-evidence.mjs",
  import.meta.url,
).pathname;
const commitSha = "a".repeat(40);
const migrationVersion = "20260711120000";
const expectedArgs = ["development", commitSha, migrationVersion];
const roots: string[] = [];
const validEvidence = {
  environment: "development",
  commit_sha: commitSha,
  migration_version: migrationVersion,
  migration_history_aligned: true,
  target_migration_present: true,
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function verifyEvidence(
  evidence: unknown,
  args: readonly string[] = expectedArgs,
  raw = false,
) {
  const root = mkdtempSync(join(tmpdir(), "dev-migration-evidence-"));
  roots.push(root);
  const evidencePath = join(root, "evidence.json");
  writeFileSync(evidencePath, raw ? String(evidence) : JSON.stringify(evidence));
  return spawnSync("node", [script, evidencePath, ...args], {
    encoding: "utf8",
  });
}

function expectSafeRejection(result: ReturnType<typeof verifyEvidence>) {
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("development migration evidence rejected\n");
  expect(result.stderr).not.toContain("secret-evidence-marker");
}

describe("development migration evidence verifier", () => {
  test("accepts exact aligned development migration evidence", () => {
    const result = verifyEvidence(validEvidence);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test.each([
    { name: "invalid JSON", evidence: "{secret-evidence-marker", raw: true },
    { name: "a missing history field", evidence: { ...validEvidence, migration_history_aligned: undefined } },
    { name: "a missing target field", evidence: { ...validEvidence, target_migration_present: undefined } },
    { name: "an additional field", evidence: { ...validEvidence, extra: "secret-evidence-marker" } },
    { name: "the wrong environment", evidence: { ...validEvidence, environment: "production" } },
    { name: "the wrong commit", evidence: { ...validEvidence, commit_sha: "b".repeat(40) } },
    { name: "the wrong migration", evidence: { ...validEvidence, migration_version: "20260712120000" } },
    { name: "a false history result", evidence: { ...validEvidence, migration_history_aligned: false } },
    { name: "a string history result", evidence: { ...validEvidence, migration_history_aligned: "true" } },
    { name: "a false target result", evidence: { ...validEvidence, target_migration_present: false } },
    { name: "a string target result", evidence: { ...validEvidence, target_migration_present: "true" } },
    { name: "a numeric commit", evidence: { ...validEvidence, commit_sha: 123 } },
    { name: "a numeric migration", evidence: { ...validEvidence, migration_version: 20260711120000 } },
    { name: "an array", evidence: [validEvidence] },
    { name: "null", evidence: null },
  ])("rejects $name without disclosing evidence", ({ evidence, raw = false }) => {
    expectSafeRejection(verifyEvidence(evidence, expectedArgs, raw));
  });

  test.each([
    { name: "a production expected environment", args: ["production", commitSha, migrationVersion] },
    { name: "an empty expected environment", args: ["", commitSha, migrationVersion] },
    { name: "a short expected SHA", args: ["development", "abc123", migrationVersion] },
    { name: "an uppercase expected SHA", args: ["development", "A".repeat(40), migrationVersion] },
    { name: "a different expected migration", args: ["development", commitSha, "20260712120000"] },
  ])("rejects $name", ({ args }) => {
    expectSafeRejection(verifyEvidence(validEvidence, args));
  });

  test.each([
    { args: [] },
    { args: ["development"] },
    { args: ["development", commitSha] },
  ])("rejects an invalid argument count %#", ({ args }) => {
    const result = spawnSync("node", [script, ...args], { encoding: "utf8" });

    expectSafeRejection(result);
  });

  test("rejects additional arguments", () => {
    expectSafeRejection(
      verifyEvidence(validEvidence, [...expectedArgs, "unexpected"]),
    );
  });
});
