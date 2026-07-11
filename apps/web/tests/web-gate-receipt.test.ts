import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

const roots: string[] = [];
const script = new URL("../../../scripts/verify-web-gate-receipt.mjs", import.meta.url).pathname;

function verify(overrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "web-gate-receipt-"));
  roots.push(root);
  const file = join(root, "receipt.json");
  writeFileSync(file, JSON.stringify({
    conclusion: "success",
    environment: "production",
    migration_version: "20260711120000",
    commit_sha: "abc123",
    ip_concurrency_passed: true,
    phone_concurrency_passed: true,
    device_concurrency_passed: true,
    single_reservation_passed: true,
    single_success_count: 1,
    ip_success_count: 5,
    phone_success_count: 1,
    device_success_count: 1,
    migration_history_aligned: true,
    target_migration_present: true,
    ...overrides,
  }));
  return Bun.spawnSync(["node", script, file, "production", "abc123", "20260711120000"], { stderr: "pipe" });
}

afterEach(() => roots.splice(0).forEach((root) => Bun.spawnSync(["rm", "-rf", root])));

describe("web gate receipt", () => {
  test("accepts a successful receipt bound to environment, SHA and migration", () => expect(verify().exitCode).toBe(0));
  test.each([
    { conclusion: "failure" },
    { environment: "development" },
    { commit_sha: "wrong" },
    { migration_version: "wrong" },
    { ip_concurrency_passed: false },
    { single_success_count: 0 },
    { ip_success_count: 0 },
    { migration_history_aligned: false },
    { migration_history_aligned: undefined },
    { target_migration_present: false },
  ])("rejects invalid receipt %#", (overrides) => expect(verify(overrides).exitCode).toBe(1));
});
