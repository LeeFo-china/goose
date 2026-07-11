import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const root = new URL("../../../", import.meta.url);
const dev = readFileSync(new URL(".github/workflows/deploy-dev.yml", root), "utf8");
const production = readFileSync(
  new URL(".github/workflows/deploy-docker-services.yml", root),
  "utf8",
);

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
});
