import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const root = new URL("../../../", import.meta.url);
const dev = readFileSync(new URL(".github/workflows/deploy-dev.yml", root), "utf8");
const production = readFileSync(
  new URL(".github/workflows/deploy-docker-services.yml", root),
  "utf8",
);

function step(workflow: string, name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

describe("Web rollback workflows", () => {
  test.each([dev, production])("verifies old revision and strict health after rollback", (workflow) => {
    expect(workflow).toContain("WEB_OLD_REVISION");
    expect(workflow).toContain("WEB_ROLLBACK_STATUS=rollback_failed");
    expect(workflow).toContain("WEB_ROLLBACK_STATUS=success");
    expect(workflow).toMatch(/health[\s\S]*revision[\s\S]*WEB_OLD_REVISION/);
    expect(workflow).toContain("x-gooes-service: web");
    expect(workflow).toContain("x-gooes-revision: ${WEB_OLD_REVISION}");
  });

  test.each([dev, production])("keeps rollback tags for at least seven days", (workflow) => {
    expect(workflow).toContain("ROLLBACK_CREATED_AT");
    expect(workflow).toContain("WEB_ROLLBACK_TAG");
    expect(workflow).toContain("cleanup-web-rollback-images.sh");
    expect(workflow).toContain("WEB_ROLLBACK_CLEANUP_STATUS=warning");
    expect(workflow).not.toContain("docker image prune -a");
  });

  test("marks a dev rollback failed before attempting compose", () => {
    const rollback = step(dev, "Roll back gated dev web");
    expect(rollback.indexOf("WEB_ROLLBACK_STATUS=rollback_failed")).toBeGreaterThanOrEqual(0);
    expect(rollback.indexOf("WEB_ROLLBACK_STATUS=rollback_failed")).toBeLessThan(
      rollback.indexOf("docker compose"),
    );
  });

  test.each([
    [dev, "GITHUB_SHA"],
    [production, "SOURCE_SHA"],
  ])("reports the final Web revision and tag from rollback status", (workflow, newRevision) => {
    const summary = step(workflow, workflow === dev ? "Write dev deployment summary" : "Deployment summary");
    expect(summary).toContain('WEB_ROLLBACK_STATUS:-');
    expect(summary).toContain("WEB_OLD_REVISION");
    expect(summary).toContain("WEB_ROLLBACK_TAG");
    expect(summary).toContain(newRevision);
    expect(summary).toMatch(/168h|7 days/);
  });
});
