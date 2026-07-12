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

describe("CI environment isolation", () => {
  test("keeps development operations on the development deploy runner", () => {
    for (const name of [
      "deploy-dev.yml",
      "migrate-dev-database.yml",
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
