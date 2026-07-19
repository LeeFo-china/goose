import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkBillingReconcileWorkerHealth,
  markBillingReconcileWorkerHealthy,
} from "./billing-reconcile-worker-health";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("billing reconcile worker health evidence", () => {
  test("writes safe atomic success evidence and reports it healthy", async () => {
    const healthFile = await createHealthFilePath();
    await markBillingReconcileWorkerHealthy({
      healthFile,
      now: () => 1_000_000,
    });

    expect(await checkBillingReconcileWorkerHealth({
      healthFile,
      maxAgeMs: 180_000,
      now: () => 1_100_000,
    })).toEqual({ status: "healthy", code: "BILLING_RECONCILE_HEALTHY" });
    const evidence = await readFile(healthFile, "utf8");
    expect(evidence).toBe("1000000\n");
    expect(evidence).not.toContain("secret");
  });

  test("reports stale evidence unhealthy and a later success recovers it", async () => {
    const healthFile = await createHealthFilePath();
    await markBillingReconcileWorkerHealthy({ healthFile, now: () => 1_000_000 });

    expect(await checkBillingReconcileWorkerHealth({
      healthFile,
      maxAgeMs: 180_000,
      now: () => 1_180_001,
    })).toEqual({ status: "unhealthy", code: "BILLING_RECONCILE_HEALTH_STALE" });

    await markBillingReconcileWorkerHealthy({ healthFile, now: () => 1_180_001 });
    expect(await checkBillingReconcileWorkerHealth({
      healthFile,
      maxAgeMs: 180_000,
      now: () => 1_180_001,
    })).toEqual({ status: "healthy", code: "BILLING_RECONCILE_HEALTHY" });
  });

  test("reports missing and malformed evidence with scalar codes only", async () => {
    const healthFile = await createHealthFilePath();
    expect(await checkBillingReconcileWorkerHealth({ healthFile }))
      .toEqual({ status: "unhealthy", code: "BILLING_RECONCILE_HEALTH_MISSING" });
    await Bun.write(healthFile, "distinctive secret detail");
    const result = await checkBillingReconcileWorkerHealth({ healthFile });
    expect(result).toEqual({
      status: "unhealthy",
      code: "BILLING_RECONCILE_HEALTH_INVALID",
    });
    expect(JSON.stringify(result)).not.toContain("distinctive secret detail");
  });
});

async function createHealthFilePath() {
  const directory = await mkdtemp(join(tmpdir(), "gooes-billing-health-"));
  directories.push(directory);
  return join(directory, "last-success");
}
