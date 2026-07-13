import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const workflowPath = (name: string): URL =>
  new URL(`.github/workflows/${name}`, repositoryRoot);
const readWorkflow = (name: string): string =>
  readFileSync(workflowPath(name), "utf8");

const forbiddenProductionRunnerLabels = [
  "gooes-build-tencent",
  "gooes-prod-vm-0-3",
];

function runBlocks(workflow: string): string[] {
  const lines = workflow.split("\n");
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*\|/.exec(lines[index] ?? "");
    if (!match) continue;
    const indent = match[1]?.length ?? 0;
    const block = [];
    while (
      index + 1 < lines.length &&
      (/^\s*$/.test(lines[index + 1] ?? "") ||
        (lines[index + 1]?.match(/^\s*/)?.[0].length ?? 0) > indent)
    ) {
      block.push(lines[index + 1] ?? "");
      index += 1;
    }
    blocks.push(block.join("\n"));
  }

  return blocks;
}

describe("CI environment isolation", () => {
  test("keeps development operations on the development deploy runner", () => {
    for (const name of [
      "deploy-dev.yml",
      "migrate-dev-database.yml",
      "verify-dev-migration-history.yml",
      "verify-dev-web-deployment-gate.yml",
    ]) {
      expect(existsSync(workflowPath(name))).toBe(true);
      const workflow = readWorkflow(name);
      expect(workflow).toContain("gooes-dev-deploy");
      expect(workflow).not.toContain("goose-old-us.pem");
      for (const label of forbiddenProductionRunnerLabels) {
        expect(workflow).not.toContain(label);
      }
    }
  });

  test("keeps automatic development orchestration isolated from production", () => {
    expect(existsSync(workflowPath("auto-deploy-dev.yml"))).toBe(true);
    const workflow = existsSync(workflowPath("auto-deploy-dev.yml"))
      ? readWorkflow("auto-deploy-dev.yml")
      : "";
    const commands = runBlocks(workflow).join("\n");

    expect(workflow).not.toContain("environment: production");
    expect(workflow).not.toContain("gooes-prod-deploy");
    expect(workflow).not.toContain("gooes-prod-vm-0-3");
    expect(workflow).not.toContain("1.13.20.39");
    expect(workflow).not.toContain("/opt/supabase/docker");
    expect(commands).not.toMatch(/supabase\s+db\s+push/);
    expect(commands).not.toMatch(/supabase(?:@\S+)?\s+migration\s+(?:up|repair)/);
    expect(commands).not.toMatch(/docker (?:container|image|builder|system) prune/);
  });

  test("keeps the reusable development migration gate read-only and immutable", () => {
    const workflow = readWorkflow("verify-dev-migration-history.yml");
    const commands = runBlocks(workflow).join("\n");

    expect(workflow).toContain("workflow_call:");
    expect(workflow).not.toContain("workflow_dispatch:");
    for (const input of ["commit_sha", "migration_version", "artifact_name"]) {
      expect(workflow).toContain(`${input}:`);
      expect(workflow).toMatch(
        new RegExp(`${input}:\\n\\s+required: true\\n\\s+type: string`),
      );
    }
    expect(workflow).toContain("evidence_b64:");
    expect(workflow).toContain(
      "value: ${{ jobs.verify.outputs.evidence_b64 }}",
    );
    expect(workflow).toContain("environment: development");
    expect(workflow).toContain("timeout-minutes: 20");
    expect(workflow).toContain('test "${RUNNER_NAME}" = "gooes-dev-vm-0-11"');
    expect(workflow).toContain(
      "DEV_DB_ENV_FILE: /opt/gooes-dev/docker/.env.dev.db",
    );

    expect(workflow).toContain("uses: actions/checkout@v6");
    expect(workflow).toContain("ref: ${{ inputs.commit_sha }}");
    expect(workflow).toContain("clean: true");
    expect(workflow).toContain("uses: actions/setup-node@v6");
    expect(workflow).toContain('node-version: "22"');
    expect(workflow).toContain("scripts/validate-web-gate-inputs.mjs");
    expect(workflow).toContain("scripts/validate-dev-database-target.mjs");
    expect(workflow).toContain("scripts/verify-migration-history.mjs");
    expect(workflow).toContain("scripts/verify-dev-migration-evidence.mjs");
    expect(workflow).toContain(
      'pnpm dlx supabase@2.99.0 migration list --db-url "${SUPABASE_DB_URL}"',
    );

    expect(workflow).toContain(
      '[[ "${ARTIFACT_NAME}" =~ ^(auto-predeploy-migration|web-gate-migration)-[a-f0-9]{40}$ ]]',
    );
    expect(workflow).toContain('"auto-predeploy-migration-${COMMIT_SHA}"');
    expect(workflow).toContain('"web-gate-migration-${COMMIT_SHA}"');
    expect(workflow).toMatch(
      /case "\$\{ARTIFACT_NAME\}" in[\s\S]*auto-predeploy-migration-\$\{COMMIT_SHA\}[\s\S]*web-gate-migration-\$\{COMMIT_SHA\}[\s\S]*\*\) exit 1 ;;/,
    );
    expect(workflow).toContain("uses: actions/upload-artifact@v6");
    expect(workflow).toContain("name: ${{ inputs.artifact_name }}");
    expect(workflow).toContain("path: migration-evidence.json");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("retention-days: 30");
    expect(workflow).toContain('base64 -w0 migration-evidence.json');
    expect(workflow).toContain('>> "${GITHUB_OUTPUT}"');

    expect(workflow).toContain(
      'ACTUAL_PROJECT_REF="$(node scripts/validate-dev-database-target.mjs --resolve-project-ref)"',
    );
    expect(workflow).not.toContain("node --input-type=module");
    expect(workflow).not.toContain("<<'NODE'");
    expect(workflow).not.toContain(
      '"${SUPABASE_DB_URL}" "${DEV_PROJECT_REF}" "${DEV_DB_HOST}" "${DEV_PROJECT_REF}"',
    );

    for (const command of runBlocks(workflow)) {
      expect(command).not.toMatch(/\$\{\{\s*(?:github\.event\.)?inputs\./);
    }
    expect(commands).not.toMatch(/supabase\s+db\s+push/);
    expect(commands).not.toMatch(/supabase(?:@\S+)?\s+migration\s+(?:up|repair)/);
    expect(commands).not.toContain("MIGRATE_MODE=apply");
    expect(commands).not.toMatch(/\bpsql\b/);
    expect(commands).not.toMatch(/\bdocker\b/);

    expect(workflow).toContain(
      "BLOCKED_DB_HOSTS: api.goodcms.cn 1.13.20.39",
    );
    const withoutBlockedTargets = workflow
      .replace(/^\s*BLOCKED_DB_HOSTS:.*$/gm, "")
      .replace(/^\s*BLOCKED_PROJECT_REFS:.*$/gm, "");
    expect(withoutBlockedTargets).not.toContain("1.13.20.39");
    expect(withoutBlockedTargets).not.toContain("api.goodcms.cn");
    expect(withoutBlockedTargets).not.toContain("unqhypivjkpwldhufpjc");
    expect(withoutBlockedTargets).not.toContain("gooes-prod-deploy");
    expect(withoutBlockedTargets).not.toContain("gooes-prod-vm-0-3");
    expect(withoutBlockedTargets).not.toContain("environment: production");
    expect(withoutBlockedTargets).not.toContain("/opt/gooes/docker");
    expect(withoutBlockedTargets).not.toMatch(/\bssh\b/);
  });

  test("builds images on a GitHub-hosted runner and publishes immutable evidence", () => {
    const workflow = readWorkflow("build-docker-images.yml");
    expect(workflow).toContain("runs-on: ubuntu-24.04");
    expect(workflow).toContain("max-parallel: 4");
    expect(workflow).toContain("timeout-minutes: 45");
    expect(workflow).toContain("docker build");
    expect(workflow).toContain("${GITHUB_SHA}");
    expect(workflow).toContain("image-manifest");
    for (const label of forbiddenProductionRunnerLabels) {
      expect(workflow).not.toContain(label);
    }
  });

  test("keeps production operations on a deploy-only runner", () => {
    for (const name of [
      "deploy-docker-services.yml",
      "migrate-production-database.yml",
      "verify-production-web-deployment-gate.yml",
    ]) {
      expect(existsSync(workflowPath(name))).toBe(true);
      const workflow = readWorkflow(name);
      expect(workflow).toContain("gooes-prod-deploy");
      expect(workflow).not.toContain("43.165.126.30");
      expect(workflow).not.toContain("goose-old-us.pem");
      expect(workflow).not.toContain("chmod 666 /var/run/docker.sock");
      expect(workflow).not.toMatch(/docker (?:container|image|builder|system) prune/);
    }
    const deploy = readWorkflow("deploy-docker-services.yml");
    expect(deploy).toContain("确认部署生产环境");
    expect(deploy).toContain('test "${GITHUB_REF_NAME}" = "main"');
  });

  test("does not build application images in deployment workflows", () => {
    for (const name of ["deploy-dev.yml", "deploy-docker-services.yml"]) {
      expect(readWorkflow(name)).not.toContain("docker build");
    }
  });

  test("uses Node 24 based official GitHub actions", () => {
    for (const name of [
      "build-docker-images.yml",
      "deploy-dev.yml",
      "verify-dev-web-deployment-gate.yml",
      "verify-web-deployment-gate.yml",
    ]) {
      expect(readWorkflow(name)).not.toMatch(
        /actions\/(?:checkout|setup-node|upload-artifact)@v4/,
      );
    }
  });
});
