import { describe, expect, test } from "bun:test";

const API_ROOT = new URL("../../", import.meta.url);
const REPOSITORY_ROOT = new URL("../../../../", import.meta.url);
const PACKAGE_JSON = new URL("package.json", API_ROOT);
const HANDOFF = new URL(
  "docs/miniprogram/2026-07-18-recharge-payment-expiration-handoff.md",
  REPOSITORY_ROOT,
);
const DESIGN = new URL(
  "docs/superpowers/specs/2026-07-18-recharge-expiration-reliability-design.md",
  REPOSITORY_ROOT,
);

describe("billing reconciliation single scheduler contract", () => {
  test("exposes only the combined billing worker package script", async () => {
    const packageJson = await Bun.file(PACKAGE_JSON).json();
    expect(packageJson.scripts["worker:billing-reconcile"]).toBe(
      "bun src/workers/billing-reconcile-worker.ts",
    );
    expect(packageJson.scripts["worker:billing-recharge-expiration"])
      .toBeUndefined();
  });

  test("removes the standalone expiration worker source and test support", async () => {
    for (const path of [
      "src/workers/billing-recharge-expiration-worker.ts",
      "src/workers/billing-recharge-expiration-worker.test.ts",
      "src/workers/billing-recharge-expiration-worker.test-helpers.ts",
      "src/workers/billing-recharge-expiration-worker.test-helpers.test.ts",
      "src/workers/billing-recharge-expiration-worker-release-log.test.ts",
    ]) {
      expect(await Bun.file(new URL(path, API_ROOT)).exists()).toBe(false);
    }
  });

  test("documents combined-worker recovery and shutdown only", async () => {
    const handoff = await Bun.file(HANDOFF).text();
    const design = await Bun.file(DESIGN).text();
    for (const document of [handoff, design]) {
      expect(document).toContain("worker:billing-reconcile");
      expect(document).not.toContain("worker:billing-recharge-expiration");
      expect(document).not.toContain("separate local expiration-worker");
    }
  });
});
