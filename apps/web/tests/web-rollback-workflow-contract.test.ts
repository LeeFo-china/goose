import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

function runRollbackEvidenceCheck(
  workflow: string,
  actualImageId: string,
  configuredImage: string,
): ReturnType<typeof spawnSync> {
  const work = mkdtempSync(join(tmpdir(), "web-rollback-evidence-"));
  roots.push(work);
  const scripts = join(work, "scripts");
  mkdirSync(scripts);
  writeFileSync(join(scripts, "prepare-site-content-deployment-secrets.sh"), ":\n");
  const docker = join(work, "docker");
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
if [ "$1" = compose ]; then exit 0; fi
if [ "$1" = inspect ] && [ "$2" = -f ]; then
  case "$3" in
    '{{if .State.Health}}{{.State.Health.Status}}{{end}}') printf '%s\\n' healthy ;;
    '{{index .Config.Labels "org.opencontainers.image.revision"}}') printf '%s\\n' "$WEB_OLD_REVISION" ;;
    '{{.Image}}') printf '%s\\n' "$ACTUAL_IMAGE_ID" ;;
    '{{.Config.Image}}') printf '%s\\n' "$ACTUAL_CONFIG_IMAGE" ;;
    *) exit 1 ;;
  esac
  exit 0
fi
exit 1
`,
  );
  chmodSync(docker, 0o755);
  const curl = join(work, "curl");
  writeFileSync(
    curl,
    `#!/usr/bin/env bash
for argument in "$@"; do url="$argument"; done
if [[ "$url" == */api/preview ]]; then
  printf 'HTTP/1.1 303\\r\\nlocation: /preview-error\\r\\ncache-control: no-store\\r\\n'
else
  printf 'HTTP/1.1 200\\r\\nx-gooes-service: web\\r\\nx-gooes-revision: %s\\r\\n' "$WEB_OLD_REVISION"
fi
`,
  );
  chmodSync(curl, 0o755);
  const sleep = join(work, "sleep");
  writeFileSync(sleep, "#!/usr/bin/env bash\n:\n");
  chmodSync(sleep, 0o755);

  const rollbackName = workflow === dev
    ? "Roll back gated dev web"
    : "Roll back production web";
  const rollbackScript = step(workflow, rollbackName)
    .split("run: |\n")[1]
    ?.replace(/^ {10}/gm, "") ?? "exit 2";
  return spawnSync("bash", ["-c", rollbackScript], {
    cwd: work,
    encoding: "utf8",
    env: {
      ...process.env,
      ACTUAL_CONFIG_IMAGE: configuredImage,
      ACTUAL_IMAGE_ID: actualImageId,
      DEV_DEPLOY_DIR: work,
      DEPLOY_DIR: work,
      GITHUB_ENV: join(work, "github-env"),
      GOOES_WEB_PROXY_SHARED_SECRET: "x".repeat(32),
      PATH: `${work}:${process.env.PATH}`,
      SOURCE_DIR: work,
      WEB_OLD_IMAGE_ID: "sha256:old-image-id",
      WEB_OLD_REVISION: "0123456789abcdef0123456789abcdef01234567",
      WEB_ROLLBACK_TAG: "gooes-web:rollback-123-456",
      WEB_SMOKE_CONTENT_PATH: "/articles/test-content",
    },
  });
}

describe("Web rollback workflows", () => {
  test("does not cancel an in-progress development deployment or rollback", () => {
    expect(dev).toContain("concurrency:");
    expect(dev).toContain("group: deploy-dev-${{ inputs.service }}");
    expect(dev).toContain("cancel-in-progress: false");
    expect(dev).not.toContain("cancel-in-progress: true");
  });

  test.each([dev, production])("verifies exact old image identity after rollback", (workflow) => {
    expect(workflow).toContain("WEB_OLD_REVISION");
    expect(workflow).toContain("WEB_OLD_IMAGE_ID");
    expect(workflow).toContain('echo "WEB_OLD_IMAGE_ID=${old_image_id}" >> "${GITHUB_ENV}"');
    expect(workflow).toContain("WEB_ROLLBACK_STATUS=rollback_failed");
    expect(workflow).toContain("WEB_ROLLBACK_STATUS=success");
    expect(workflow).toMatch(/health[\s\S]*revision[\s\S]*WEB_OLD_REVISION/);
    expect(workflow).toContain("image_id");
    expect(workflow).toContain('test "${image_id}" = "${WEB_OLD_IMAGE_ID}"');
    expect(workflow).toContain('test "${configured_image}" = "${WEB_ROLLBACK_TAG}"');
    expect(workflow).toContain("x-gooes-service: web");
    expect(workflow).toContain("x-gooes-revision: ${WEB_OLD_REVISION}");
  });

  test.each([dev, production])(
    "rejects the same revision when rollback resolves to a different image",
    (workflow) => {
      expect(
        runRollbackEvidenceCheck(
          workflow,
          "sha256:different-image-id",
          "gooes-web:rollback-123-456",
        ).status,
      ).not.toBe(0);
    },
  );

  test.each([dev, production])(
    "accepts the exact old image ID and rollback tag",
    (workflow) => {
      const result = runRollbackEvidenceCheck(
        workflow,
        "sha256:old-image-id",
        "gooes-web:rollback-123-456",
      );
      expect(result.status, result.stderr).toBe(0);
    },
  );

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
