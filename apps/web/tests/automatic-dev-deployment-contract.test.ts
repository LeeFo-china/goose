import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const workflow = readFileSync(
  new URL(".github/workflows/build-docker-images.yml", repositoryRoot),
  "utf8",
);

const sliceBetween = (startMarker: string, endMarker: string): string => {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
};

describe("automatic development image build contract", () => {
  test("triggers affected-service builds for main pushes without removing manual builds", () => {
    expect(workflow).toContain("push:");
    expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\[main\]/);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("target_environment:");
    expect(workflow).toContain("service:");
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("Build development affected services");
    expect(workflow).toContain("build-docker-images-development-push");
  });

  test("resolves and verifies immutable development plans from the push range", () => {
    const validateJob = sliceBetween("  validate-request:", "  build:");
    const resolveStep = sliceBetween(
      "- name: Resolve build plan",
      "- name: Upload development build plan",
    );

    expect(validateJob).toContain("fetch-depth: 0");
    expect(resolveStep).toContain("github.event.before");
    expect(resolveStep).toContain("github.sha");
    expect(resolveStep).toContain("github.run_id");
    expect(resolveStep).toContain("git diff --name-only -z");
    expect(resolveStep).toContain("scripts/resolve-dev-change-plan.mjs");
    expect(resolveStep).toContain("scripts/verify-dev-build-plan.mjs");
    expect(resolveStep).toContain("build-plan.json");
    expect(resolveStep).toContain('target_environment: "development"');
    expect(resolveStep).not.toContain("git ls-files");
  });

  test("uses a direct conservative fallback when the before commit is unavailable", () => {
    const resolveStep = sliceBetween(
      "- name: Resolve build plan",
      "- name: Upload development build plan",
    );

    expect(resolveStep).toMatch(/\^0\{40\}\$/);
    expect(resolveStep).toContain('git cat-file -e "${BEFORE_SHA}^{commit}"');
    expect(resolveStep).toContain('schema_version: 1');
    expect(resolveStep).toContain('migration_changed: true');
    expect(resolveStep).toContain('changed_files: []');
    expect(resolveStep).toContain('classifications: ["fallback-all"]');
    expect(resolveStep).toContain(
      'build_services: ["api", "admin", "web", "social-video-worker"]',
    );
    expect(resolveStep).toContain(
      'deploy_services: ["api", "admin", "web", "social-video-worker", "cos-reconcile-worker"]',
    );
    expect(resolveStep).toContain('no_op: false');
    expect(resolveStep).not.toMatch(/resolve-dev-change-plan\.mjs[^\n]*(?:\|\||catch)/);
  });

  test("publishes one durable build-plan artifact after successful resolution", () => {
    const uploadStep = sliceBetween(
      "- name: Upload development build plan",
      "  build:",
    );

    expect(uploadStep).toContain("uses: actions/upload-artifact@v6");
    expect(uploadStep).toContain("name: dev-build-plan");
    expect(uploadStep).toContain("path: build-plan.json");
    expect(uploadStep).toContain("if-no-files-found: error");
    expect(uploadStep).toContain("retention-days: 30");
    expect(uploadStep).not.toContain("always()");
  });

  test("exports the plan contract and isolates push from manual inputs", () => {
    const validateJob = sliceBetween("  validate-request:", "  build:");

    for (const output of [
      "build_services",
      "deploy_services",
      "no_op",
      "target_environment",
    ]) {
      expect(validateJob).toContain(`${output}:`);
      expect(validateJob).toContain(`${output}=`);
    }

    expect(validateJob).toContain("TARGET_ENVIRONMENT=development");
    expect(validateJob).toContain("REQUESTED_TARGET_ENVIRONMENT");
    expect(validateJob).toContain("REQUESTED_SERVICE");
    expect(validateJob).toContain("resolve-web-deployment.mjs build");
    expect(validateJob).toContain("resolve-web-deployment.mjs deploy");
    expect(validateJob).toContain("development|production");
    expect(validateJob).toContain(
      'classifications: ($classifications | split(" ") | sort)',
    );
    expect(validateJob).toContain("### Production all-service behavior");
    expect(validateJob).not.toMatch(/run:\s*\|[\s\S]*\$\{\{\s*inputs\./);
  });

  test("builds only selected services using the validated target environment", () => {
    const buildJob = workflow.slice(workflow.indexOf("  build:"));
    const matrix = buildJob.slice(buildJob.indexOf("matrix:"), buildJob.indexOf("steps:"));

    expect(buildJob).toContain(
      "environment: ${{ needs.validate-request.outputs.target_environment }}",
    );
    expect(buildJob).toContain(
      "TARGET_ENVIRONMENT: ${{ needs.validate-request.outputs.target_environment }}",
    );
    expect(buildJob).not.toContain("github.event.inputs.target_environment");
    expect(buildJob).not.toContain("inputs.target_environment");

    for (const service of ["api", "admin", "web", "social-video-worker"]) {
      expect(matrix).toContain(`service: ${service}`);
    }

    for (const stepName of [
      "Login to Tencent CCR",
      "Build and push image",
      "Upload image manifest",
    ]) {
      const stepStart = buildJob.indexOf(`- name: ${stepName}`);
      expect(stepStart).toBeGreaterThanOrEqual(0);
      const nextStep = buildJob.indexOf("- name:", stepStart + 1);
      const step = buildJob.slice(stepStart, nextStep === -1 ? undefined : nextStep);
      expect(step).toContain("needs.validate-request.outputs.build_services");
    }

    expect(buildJob).toContain("docker/api.Dockerfile");
    expect(buildJob).toContain("docker/admin.Dockerfile");
    expect(buildJob).toContain("docker/web.Dockerfile");
    expect(buildJob).toContain("docker/social-video-worker.Dockerfile");
    expect(buildJob).toContain("image-manifest-${SERVICE}.json");
  });

  test("does not introduce deployment runners or production deployment coupling", () => {
    expect(workflow).toContain("runs-on: ubuntu-24.04");
    expect(workflow).not.toContain("gooes-dev-deploy");
    expect(workflow).not.toContain("gooes-build-tencent");
    expect(workflow).not.toContain("gooes-prod-deploy");
    expect(workflow).not.toContain("gooes-prod-vm-0-3");
    expect(workflow).not.toContain("uses: ./.github/workflows/deploy-docker-services.yml");
  });
});
