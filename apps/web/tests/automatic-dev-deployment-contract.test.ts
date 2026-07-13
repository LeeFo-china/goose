import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const workflow = readFileSync(
  new URL(".github/workflows/build-docker-images.yml", repositoryRoot),
  "utf8",
);
const autoDeployWorkflowUrl = new URL(
  ".github/workflows/auto-deploy-dev.yml",
  repositoryRoot,
);
const autoDeployWorkflow = existsSync(autoDeployWorkflowUrl)
  ? readFileSync(autoDeployWorkflowUrl, "utf8")
  : "";

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

  test("never cancels an in-flight main push build with a narrower diff", () => {
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name != 'push' || inputs.target_environment != '' || inputs.service != '' }}",
    );
  });

  test("resolves and verifies immutable development plans from the push range", () => {
    const validateJob = sliceBetween("  validate-request:", "  build:");
    const resolveStep = sliceBetween(
      "- name: Resolve build plan",
      "- name: Upload immutable build plan",
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
      "- name: Upload immutable build plan",
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
      "- name: Upload immutable build plan",
      "  build:",
    );

    expect(uploadStep).toContain("uses: actions/upload-artifact@v6");
    expect(uploadStep).toContain(
      "name: ${{ steps.resolve.outputs.target_environment == 'production' && 'production-build-plan' || 'dev-build-plan' }}",
    );
    expect(uploadStep).toContain("production-build-plan");
    expect(uploadStep).toContain("dev-build-plan");
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
    const buildJobHeader = buildJob.slice(0, buildJob.indexOf("strategy:"));
    const matrix = buildJob.slice(buildJob.indexOf("matrix:"), buildJob.indexOf("steps:"));

    expect(buildJobHeader).toContain(
      "if: ${{ needs.validate-request.outputs.no_op != 'true' }}",
    );
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

describe("automatic development deployment orchestration contract", () => {
  test("runs only after a completed main push image build", () => {
    expect(existsSync(autoDeployWorkflowUrl)).toBe(true);
    expect(autoDeployWorkflow).toMatch(
      /workflow_run:\s*\n\s+workflows:\s*\[Build Docker Images\]\s*\n\s+types:\s*\[completed\]\s*\n\s+branches:\s*\[main\]/,
    );
    expect(autoDeployWorkflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(autoDeployWorkflow).toContain(
      "github.event.workflow_run.event == 'push'",
    );
    expect(autoDeployWorkflow).toContain(
      "github.event.workflow_run.head_branch == 'main'",
    );
    expect(autoDeployWorkflow).toContain("group: auto-deploy-development");
    expect(autoDeployWorkflow).toContain("cancel-in-progress: false");
  });

  test("downloads and strictly binds the upstream development build plan", () => {
    expect(autoDeployWorkflow).toContain("permissions:");
    expect(autoDeployWorkflow).toContain("contents: read");
    expect(autoDeployWorkflow).toContain("actions: read");
    expect(autoDeployWorkflow).toContain("github.event.workflow_run.id");
    expect(autoDeployWorkflow).toContain("github.event.workflow_run.head_sha");
    expect(autoDeployWorkflow).toContain('gh run download "${UPSTREAM_RUN_ID}"');
    expect(autoDeployWorkflow).toContain("-n dev-build-plan");
    expect(autoDeployWorkflow).toContain("scripts/verify-dev-build-plan.mjs");
    expect(autoDeployWorkflow).toContain(
      'build-plan.json "${UPSTREAM_SHA}" "${UPSTREAM_RUN_ID}"',
    );

    for (const output of [
      "commit_sha",
      "build_run_id",
      "no_op",
      "has_api",
      "has_web",
      "has_rest",
      "rest_matrix",
    ]) {
      expect(autoDeployWorkflow).toContain(`${output}:`);
      expect(autoDeployWorkflow).toContain(`${output}=`);
    }
  });

  test("runs the read-only migration gate before any deployment", () => {
    const migration = autoDeployWorkflow.indexOf("  migration:");
    const firstDeploy = autoDeployWorkflow.indexOf(
      "uses: ./.github/workflows/deploy-dev.yml",
    );

    expect(migration).toBeGreaterThanOrEqual(0);
    expect(firstDeploy).toBeGreaterThan(migration);
    expect(autoDeployWorkflow).toContain(
      "uses: ./.github/workflows/verify-dev-migration-history.yml",
    );
    expect(autoDeployWorkflow).toContain(
      "if: ${{ needs.authorize.outputs.no_op == 'false' }}",
    );
    expect(autoDeployWorkflow).toContain(
      "artifact_name: auto-predeploy-migration-${{ needs.authorize.outputs.commit_sha }}",
    );
    expect(autoDeployWorkflow).toContain("  deploy-api:");
    expect(autoDeployWorkflow).toContain("  api-ready:");
    expect(autoDeployWorkflow).toContain("if: ${{ always()");
    expect(autoDeployWorkflow).toContain('case "${MIGRATION_RESULT}" in');
    expect(autoDeployWorkflow).toContain('case "${API_RESULT}" in');
  });

  test("serializes the remaining selected services behind the API barrier", () => {
    expect(autoDeployWorkflow).toContain("  deploy-rest:");
    expect(autoDeployWorkflow).toContain("needs: [authorize, api-ready]");
    expect(autoDeployWorkflow).toContain(
      "if: ${{ needs.authorize.outputs.has_rest == 'true'",
    );
    expect(autoDeployWorkflow).toContain("max-parallel: 1");
    expect(autoDeployWorkflow).toContain(
      "matrix: ${{ fromJSON(needs.authorize.outputs.rest_matrix) }}",
    );
    expect(autoDeployWorkflow).toContain("service: ${{ matrix.service }}");
    expect(autoDeployWorkflow).toContain("  rest-ready:");
    expect(autoDeployWorkflow).toContain('case "${REST_RESULT}" in');
  });

  test("gates Web after all barriers and passes its inline receipt to deployment", () => {
    expect(autoDeployWorkflow).toContain("  web-gate:");
    expect(autoDeployWorkflow).toContain(
      "needs: [authorize, api-ready, rest-ready]",
    );
    expect(autoDeployWorkflow).toContain(
      "uses: ./.github/workflows/verify-dev-web-deployment-gate.yml",
    );
    expect(autoDeployWorkflow).toContain("  deploy-web:");
    expect(autoDeployWorkflow).toContain("needs: [authorize, web-gate]");
    expect(autoDeployWorkflow).toContain("service: web");
    expect(autoDeployWorkflow).toContain("expected_build_event: push");
    expect(autoDeployWorkflow).toContain(
      "gate_receipt_b64: ${{ needs.web-gate.outputs.receipt_b64 }}",
    );
  });

  test("reports results without converting upstream failures into success", () => {
    const summary = autoDeployWorkflow.slice(
      autoDeployWorkflow.indexOf("  summary:"),
    );

    expect(summary).toContain("if: ${{ always()");
    expect(summary).toContain("GITHUB_STEP_SUMMARY");
    expect(summary).toContain("needs.migration.result");
    expect(summary).toContain("needs.deploy-api.result");
    expect(summary).toContain("needs.api-ready.result");
    expect(summary).toContain("needs.deploy-rest.result");
    expect(summary).toContain("needs.rest-ready.result");
    expect(summary).toContain("needs.deploy-web.result");
    expect(summary).not.toContain("exit 0");
  });

  test("does not interpolate caller inputs directly into shell blocks", () => {
    for (const block of autoDeployWorkflow.matchAll(/run:\s*\|([\s\S]*?)(?=\n\s+- |\n\s{2}\w|$)/g)) {
      expect(block[1] ?? "").not.toMatch(/\$\{\{\s*(?:github\.event\.)?inputs\./);
    }
  });
});
