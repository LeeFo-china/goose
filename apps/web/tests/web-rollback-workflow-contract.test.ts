import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../../../", import.meta.url);
const dev = readFileSync(new URL(".github/workflows/deploy-dev.yml", root), "utf8");
const production = readFileSync(
  new URL(".github/workflows/deploy-docker-services.yml", root),
  "utf8",
);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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

  test("production rollback repeats the complete pre-cutover loopback smoke", () => {
    const rollback = step(production, "Roll back production web");

    expect(rollback).toContain("set -euo pipefail");
    expect(rollback.indexOf("WEB_ROLLBACK_STATUS=rollback_failed")).toBeLessThan(
      rollback.indexOf('smoke_rollback_url "/"'),
    );
    for (const path of [
      'smoke_rollback_url "/"',
      'smoke_rollback_url "/partners"',
      'smoke_rollback_url "/sitemap.xml"',
      'smoke_rollback_url "${WEB_SMOKE_CONTENT_PATH}"',
    ]) {
      expect(rollback).toContain(path);
    }
    expect(rollback).toContain("http://127.0.0.1:3020/api/preview");
    expect(rollback).toContain("x-gooes-revision: ${WEB_OLD_REVISION}");
    expect(rollback).toContain("tr -d '\\r'");
    expect(rollback).toContain("^HTTP/[^ ]+ 200$");
    expect(rollback).toContain("^HTTP/[^ ]+ 303$");
    expect(rollback).toContain("^location: /preview-error$");
    expect(rollback).toContain("^cache-control: no-store$");
    expect(rollback.indexOf("WEB_ROLLBACK_STATUS=success")).toBeGreaterThan(
      rollback.indexOf("^cache-control: no-store$"),
    );
  });

  test.each([dev, production])("reports the final Web revision and tag from container inspection", (workflow) => {
    const summary = step(workflow, workflow === dev ? "Write dev deployment summary" : "Deployment summary");
    expect(summary).toContain("docker inspect");
    expect(summary).toContain("GOOES_WEB_IMAGE:-not_set");
    expect(summary).not.toContain('web_revision="${SOURCE_SHA}"');
    expect(summary).not.toContain('revision="${GITHUB_SHA}"');
    expect(summary).toMatch(/168h|7 days/);
  });

  test.each([dev, production])("tracks deployment stages and inspects the actual Web container", (workflow) => {
    expect(workflow).toContain("WEB_DEPLOY_STAGE=initial");
    expect(workflow).toContain("WEB_DEPLOY_STAGE=gate_rejected");
    expect(workflow).toContain("WEB_DEPLOY_STAGE=gate_validated");
    expect(workflow).toContain("WEB_DEPLOY_STAGE=deploying");
    expect(workflow).toContain(
      workflow === dev
        ? "WEB_DEPLOY_STAGE=success"
        : "WEB_DEPLOY_STAGE=container_ready_for_manual_cutover",
    );
    expect(workflow).toContain("WEB_DEPLOY_STAGE=rollback_failed");
    expect(workflow).toContain("WEB_DEPLOY_STAGE=rolled_back");
    const summary = step(workflow, workflow === dev ? "Write dev deployment summary" : "Deployment summary");
    expect(summary).not.toContain("set -euo pipefail");
    expect(summary).toContain("docker inspect");
    expect(summary).toContain("not_running");
    expect(summary).toContain("unknown");
    expect(summary).toContain("WEB_DEPLOY_STAGE:-initial");
    expect(summary).toContain("GOOES_WEB_IMAGE:-not_set");
  });

  test("production summary survives an early rejected gate with no Web container", () => {
    const root = mkdtempSync(join(tmpdir(), "web-summary-"));
    roots.push(root);
    const summaryPath = join(root, "summary.md");
    const docker = join(root, "docker");
    writeFileSync(
      docker,
      `#!/usr/bin/env bash
if [ "$1" = ps ] && [ "$2" = -aq ]; then exit 0; fi
if [ "$1" = ps ]; then printf '%s\\n' NAMES; exit 0; fi
exit 1
`,
    );
    chmodSync(docker, 0o755);
    const summaryScript = step(production, "Deployment summary")
      .split("run: |\n")[1]
      ?.replaceAll("${{ job.status }}", "failure")
      .replace(/^ {10}/gm, "") ?? "exit 2";
    const result = spawnSync("bash", ["-c", summaryScript], {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: `${root}:${process.env.PATH}`,
        GITHUB_STEP_SUMMARY: summaryPath,
        WEB_DEPLOY_STAGE: "gate_rejected",
        DEPLOY_SERVICES: "web",
      },
    });

    expect(result.status).toBe(0);
    const rendered = readFileSync(summaryPath, "utf8");
    expect(rendered).toContain("gate_rejected");
    expect(rendered).toContain("not_deployed");
    expect(rendered).toContain("not_running");
    expect(rendered).toContain("not_set");
  });
});
