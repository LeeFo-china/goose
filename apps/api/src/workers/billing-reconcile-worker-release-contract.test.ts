import { describe, expect, test } from "bun:test";

const REPOSITORY_ROOT = new URL("../../../../", import.meta.url);
const HEALTH_FILE = "/tmp/gooes-billing-reconcile-worker-health";

describe("billing reconcile worker release health contract", () => {
  test.each([
    ["production", "deploy/docker-compose.api.yml", "gooes-billing-reconcile-worker:"],
    ["development", "deploy/docker-compose.dev.yml", "gooes-billing-reconcile-worker-dev:"],
  ])("uses freshness evidence in %s compose", async (_environment, path, service) => {
    const compose = await Bun.file(new URL(path, REPOSITORY_ROOT)).text();
    const worker = serviceBlock(compose, service);
    expect(worker).toContain(`BILLING_RECONCILE_HEALTH_FILE: ${HEALTH_FILE}`);
    expect(worker).toContain('BILLING_RECONCILE_HEALTH_MAX_AGE_MS: "180000"');
    expect(worker).toContain(
      'test: ["CMD", "bun", "src/workers/billing-reconcile-worker-health.ts"]',
    );
    expect(worker).toContain("start_period: 120s");
    expect(worker).not.toContain("/proc/1/stat");
  });

  test("release waits for Docker healthy state before runtime evidence", async () => {
    const workflow = await Bun.file(new URL(
      ".github/workflows/deploy-docker-services.yml",
      REPOSITORY_ROOT,
    )).text();
    expect(workflow).toContain('[ "$state" = "running" ] && [ "$health" = "healthy" ]');
    expect(workflow).toContain(
      "check_container gooes-billing-reconcile-worker",
    );
  });
});

function serviceBlock(compose: string, service: string) {
  const start = compose.indexOf(`  ${service}`);
  if (start < 0) return "";
  const end = compose.indexOf("\n  gooes-", start + service.length + 2);
  return compose.slice(start, end < 0 ? undefined : end);
}
