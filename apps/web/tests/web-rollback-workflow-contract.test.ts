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

  test.each([dev, production])("keeps one rollback tag after successful deployment", (workflow) => {
    expect(workflow).toContain("Prune old successful");
    expect(workflow).toContain("awk '/^gooes-web:rollback-/'");
    expect(workflow).toContain("tail -n +2");
    expect(workflow).not.toContain("docker image prune -a");
  });
});
