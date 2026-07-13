import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const buildWorkflow = readFileSync(
  new URL("../.github/workflows/build-docker-images.yml", import.meta.url),
  "utf8",
);
const autoDeployDevWorkflow = readFileSync(
  new URL("../.github/workflows/auto-deploy-dev.yml", import.meta.url),
  "utf8",
);
const deployDevWorkflow = readFileSync(
  new URL("../.github/workflows/deploy-dev.yml", import.meta.url),
  "utf8",
);
const releaseDevWorkflowUrl = new URL(
  "../.github/workflows/release-dev.yml",
  import.meta.url,
);
const releaseDevWorkflow = existsSync(releaseDevWorkflowUrl)
  ? readFileSync(releaseDevWorkflowUrl, "utf8")
  : "";
const releaseProductionWorkflowUrl = new URL(
  "../.github/workflows/release-production.yml",
  import.meta.url,
);
const releaseProductionWorkflow = existsSync(releaseProductionWorkflowUrl)
  ? readFileSync(releaseProductionWorkflowUrl, "utf8")
  : "";
const deployProductionWorkflow = readFileSync(
  new URL("../.github/workflows/deploy-docker-services.yml", import.meta.url),
  "utf8",
);

const script = new URL("./resolve-admin-release-services.mjs", import.meta.url).pathname;

function resolve(mode: string, services: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(["node", script, mode, services], {
    stderr: "pipe",
    stdout: "pipe",
  });
}

function sliceWorkflowJob(workflow: string, job: string, nextJob: string): string {
  const start = workflow.indexOf(`  ${job}:`);
  const end = workflow.indexOf(`  ${nextJob}:`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("admin release service resolver", () => {
  test.each([
    ["requested", "all", "api,admin,social-video-worker,cos-reconcile-worker"],
    ["build", "all", "api,admin,social-video-worker"],
    ["requested", "cos-reconcile-worker", "cos-reconcile-worker"],
    ["build", "cos-reconcile-worker", "api"],
    ["requested", "admin,api,admin", "api,admin"],
    ["requested", " admin, api, admin ", "api,admin"],
  ])("resolves %s services %s in dependency order", (mode, services, expected) => {
    const result = resolve(mode, services);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString("utf8")).toBe("");
    expect(result.stdout.toString("utf8").trim()).toBe(expected);
  });

  test.each([
    ["requested", "web"],
    ["requested", ""],
    ["deploy", "api"],
  ])("rejects invalid input %s %s", (mode, services) => {
    const result = resolve(mode, services);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString("utf8")).toBe("");
    expect(result.stderr.toString("utf8").trim().length).toBeGreaterThan(0);
  });
});

describe("reusable build workflow", () => {
  test("exposes stable inputs, outputs, and environment-specific build plans", () => {
    expect(buildWorkflow).toContain("push:\n    branches: [main]");
    expect(buildWorkflow).toContain("workflow_dispatch:");
    expect(buildWorkflow).toContain("workflow_call:");
    expect(buildWorkflow).toContain(
      "target_environment:\n        required: true\n        type: string",
    );
    expect(buildWorkflow).toContain("service:\n        required: true\n        type: string");
    expect(buildWorkflow).toContain(
      "      build_services:\n        value: ${{ jobs.validate-request.outputs.build_services }}",
    );
    expect(buildWorkflow).toContain(
      "      deploy_services:\n        value: ${{ jobs.validate-request.outputs.deploy_services }}",
    );
    expect(buildWorkflow).toContain(
      "      no_op:\n        value: ${{ jobs.validate-request.outputs.no_op }}",
    );
    expect(buildWorkflow).toContain(
      "      target_environment:\n        value: ${{ jobs.validate-request.outputs.target_environment }}",
    );
    expect(buildWorkflow).toContain("inputs.target_environment");
    expect(buildWorkflow).toContain("inputs.service");
    expect(buildWorkflow).toContain(
      "name: ${{ steps.resolve.outputs.target_environment == 'production' && 'production-build-plan' || 'dev-build-plan' }}",
    );
  });

  test("distinguishes a direct push from a reusable call whose caller event is push", () => {
    expect(buildWorkflow).toContain(
      "run-name: ${{ github.event_name == 'push' && inputs.target_environment == '' && inputs.service == '' && 'Build development affected services' || format('Build {0} {1}', inputs.target_environment, inputs.service || 'all') }}",
    );
    expect(buildWorkflow).toContain(
      "group: ${{ github.event_name == 'push' && inputs.target_environment == '' && inputs.service == '' && 'build-docker-images-development-push' || format('build-docker-images-{0}-{1}', inputs.target_environment, inputs.service) }}",
    );
    expect(buildWorkflow).toContain(
      "cancel-in-progress: ${{ github.event_name != 'push' || inputs.target_environment != '' || inputs.service != '' }}",
    );
    expect(buildWorkflow).toContain(
      "DIRECT_PUSH: ${{ github.event_name == 'push' && inputs.target_environment == '' && inputs.service == '' }}",
    );
    expect(buildWorkflow).toContain('if [ "${DIRECT_PUSH}" = "true" ]; then');
    expect(buildWorkflow).not.toContain('if [ "${GITHUB_EVENT_NAME}" = "push" ]; then');
  });

  test("keeps automatic development deployment bound to successful push evidence", () => {
    expect(autoDeployDevWorkflow).toContain(
      "gh run download \"${UPSTREAM_RUN_ID}\" -n dev-build-plan",
    );
    expect(autoDeployDevWorkflow).toContain(
      "github.event.workflow_run.event == 'push'",
    );
    expect(autoDeployDevWorkflow).toContain(
      "test \"$(jq -r '.event' <<< \"${run_json}\")\" = push",
    );
    expect(autoDeployDevWorkflow).toContain(
      "test \"$(jq -r '.path' <<< \"${run_json}\")\" = \".github/workflows/build-docker-images.yml\"",
    );
  });
});

describe("development orchestrator", () => {
  test("provides a development-only manual release entrypoint", () => {
    expect(releaseDevWorkflow).toContain("name: Release Dev");
    expect(releaseDevWorkflow).toContain("workflow_dispatch:");
    expect(releaseDevWorkflow).not.toContain("workflow_call:");
    expect(releaseDevWorkflow).not.toContain("\n  push:");
    expect(releaseDevWorkflow).not.toContain("workflow_run:");
    const serviceInput = releaseDevWorkflow.slice(
      releaseDevWorkflow.indexOf("      service:"),
      releaseDevWorkflow.indexOf("      operation:"),
    );
    expect(serviceInput).toContain("required: true");
    expect(serviceInput).toContain("type: string");
    expect(releaseDevWorkflow).toContain("options: [release, rollback]");
    expect(releaseDevWorkflow).toContain("reason:");
    expect(releaseDevWorkflow).toContain("contents: read");
    expect(releaseDevWorkflow).toContain("actions: read");
    expect(releaseDevWorkflow).toContain("group: admin-release-development");
    expect(releaseDevWorkflow).toContain("cancel-in-progress: false");
    expect(releaseDevWorkflow).not.toContain("gooes-prod-deploy");
    expect(releaseDevWorkflow).not.toContain("1.13.20.39");
    expect(releaseDevWorkflow).not.toContain("production");
    expect(releaseDevWorkflow).not.toContain("web");
  });

  test("prepares ordered requested and build service evidence", () => {
    expect(releaseDevWorkflow).toContain("[[ \"${GITHUB_SHA}\" =~ ^[a-f0-9]{40}$ ]]");
    expect(releaseDevWorkflow).toContain('test "$(git rev-parse HEAD)" = "${GITHUB_SHA}"');
    expect(releaseDevWorkflow).toContain(
      'node scripts/resolve-admin-release-services.mjs requested "${REQUESTED_SERVICE}"',
    );
    expect(releaseDevWorkflow).toContain(
      'node scripts/resolve-admin-release-services.mjs build "${REQUESTED_SERVICE}"',
    );
    for (const output of [
      "requested_services",
      "build_services",
      "has_api",
      "has_rest",
      "rest_matrix",
    ]) {
      expect(releaseDevWorkflow).toContain(`${output}:`);
    }
  });

  test("builds, verifies migrations, and deploys API before remaining services", () => {
    const deployApi = sliceWorkflowJob(releaseDevWorkflow, "deploy-api", "api-ready");
    const deployRest = sliceWorkflowJob(releaseDevWorkflow, "deploy-rest", "rest-ready");

    expect(releaseDevWorkflow).toContain("uses: ./.github/workflows/build-docker-images.yml");
    expect(releaseDevWorkflow).toContain("target_environment: development");
    expect(releaseDevWorkflow).toContain("uses: ./.github/workflows/verify-dev-migration-history.yml");
    expect(releaseDevWorkflow).toContain('migration_version: "20260711120000"');
    expect(releaseDevWorkflow).toContain(
      "artifact_name: auto-predeploy-migration-${{ github.sha }}",
    );
    expect(releaseDevWorkflow).toContain("max-parallel: 1");
    expect(releaseDevWorkflow.indexOf("deploy-api:")).toBeLessThan(
      releaseDevWorkflow.indexOf("deploy-rest:"),
    );
    for (const [job, service] of [
      [deployApi, "api"],
      [deployRest, "${{ matrix.service }}"],
    ]) {
      expect(job).toContain("uses: ./.github/workflows/deploy-dev.yml");
      expect(job).toContain(`service: ${service}`);
      expect(job).toContain("commit_sha: ${{ github.sha }}");
      expect(job).toContain("build_run_id: ${{ github.run_id }}");
      expect(job).toContain("expected_build_event: workflow_dispatch");
      expect(job).toContain("evidence_mode: same_run");
      expect(job).toContain(
        "expected_build_workflow_path: .github/workflows/release-dev.yml",
      );
    }
    expect(deployRest).toContain("needs: [prepare, api-ready]");
    expect(deployRest).toContain("max-parallel: 1");
  });

  test("propagates required job results and reports release semantics", () => {
    expect(releaseDevWorkflow).toContain("name: Require build, migration, and API readiness");
    expect(releaseDevWorkflow).toContain("needs: [prepare, build, migration, deploy-api]");
    expect(releaseDevWorkflow).toContain("name: Require remaining services readiness");
    expect(releaseDevWorkflow).toContain("needs: [prepare, api-ready, deploy-rest]");
    expect(releaseDevWorkflow).toContain("if: ${{ always() }}");
    expect(releaseDevWorkflow).toContain("OPERATION: ${{ inputs.operation }}");
    expect(releaseDevWorkflow).toContain("REASON: ${{ inputs.reason }}");
    for (const field of [
      "Selected ref",
      "Commit SHA",
      "Requested services",
      "Build services",
      "Build",
      "Migration",
      "API deployment",
      "Remaining deployment",
      "Final outcome",
    ]) {
      expect(releaseDevWorkflow).toContain(field);
    }
    expect(releaseDevWorkflow).toContain('test "${FINAL_OUTCOME}" = success');
  });

  test("splits same-run and completed-run evidence before manifest validation", () => {
    expect(deployDevWorkflow).toContain("default: completed_run");
    expect(deployDevWorkflow).toContain(
      "default: .github/workflows/build-docker-images.yml",
    );
    const evidenceStart = deployDevWorkflow.indexOf(
      "- name: Validate immutable build evidence",
    );
    const evidenceEnd = deployDevWorkflow.indexOf(
      "- name: Validate gated dev web deployment",
      evidenceStart,
    );
    const evidence = deployDevWorkflow.slice(evidenceStart, evidenceEnd);
    const splitStart = evidence.indexOf('case "${EVIDENCE_MODE}" in');
    const sameRunStart = evidence.indexOf("same_run)", splitStart);
    const completedRunStart = evidence.indexOf("completed_run)", sameRunStart);
    const splitEnd = evidence.indexOf(
      "\n          esac\n          receipt_dir=",
      completedRunStart,
    );
    const manifestStart = evidence.indexOf('receipt_dir="${RUNNER_TEMP}', splitEnd);
    const sameRun = evidence.slice(sameRunStart, completedRunStart);
    const completedRun = evidence.slice(completedRunStart, splitEnd);
    const manifestEvidence = evidence.slice(splitEnd);

    expect(evidenceStart).toBeGreaterThanOrEqual(0);
    expect(evidenceEnd).toBeGreaterThan(evidenceStart);
    expect(splitStart).toBeGreaterThanOrEqual(0);
    expect(sameRunStart).toBeGreaterThan(splitStart);
    expect(completedRunStart).toBeGreaterThan(sameRunStart);
    expect(splitEnd).toBeGreaterThan(completedRunStart);
    expect(manifestStart).toBeGreaterThan(splitEnd);
    expect(evidence).toContain("canonical_workflow_path() {");
    expect(evidence).toContain(
      'workflow_id="$(jq -er \'.workflow_id | select(type == "number" and . > 0 and (floor == .))\' <<< "${run_json}")"',
    );
    expect(evidence).toContain('[[ "${workflow_id}" =~ ^[1-9][0-9]*$ ]]');
    expect(evidence).toContain(
      'workflow_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_id}")"',
    );
    expect(evidence).toContain(
      'jq -er \'.path | select(type == "string" and length > 0)\' <<< "${workflow_json}"',
    );
    expect(evidence).not.toContain('.path | split("@")[0]');
    expect(evidence).not.toMatch(
      /jq[^\n]*\.path[^\n]*<<< "\$\{(?:current_)?run_json\}"/,
    );
    expect(sameRun).toContain(
      'test "${INPUT_BUILD_RUN_ID}" = "${GITHUB_RUN_ID}"',
    );
    expect(sameRun).toContain(
      'current_run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}")"',
    );
    expect(sameRun).toContain(
      'current_workflow_path="$(canonical_workflow_path "${current_run_json}")"',
    );
    expect(sameRun).toContain(
      'test "${current_workflow_path}" = "${EXPECTED_BUILD_WORKFLOW_PATH}"',
    );
    expect(sameRun).toContain(
      'test "${EXPECTED_BUILD_WORKFLOW_PATH}" = ".github/workflows/release-dev.yml"',
    );
    expect(sameRun).toContain(
      'test "$(jq -r \'.event\' <<< "${current_run_json}")" = workflow_dispatch',
    );
    expect(sameRun).toContain(
      'test "$(jq -r \'.head_sha\' <<< "${current_run_json}")" = "${SOURCE_SHA}"',
    );
    expect(sameRun).toContain('test "${EXPECTED_BUILD_EVENT}" = workflow_dispatch');

    expect(completedRun).toContain(
      'run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${INPUT_BUILD_RUN_ID}")"',
    );
    expect(completedRun).toContain(
      'build_workflow_path="$(canonical_workflow_path "${run_json}")"',
    );
    expect(completedRun).toContain(
      'test "${build_workflow_path}" = "${EXPECTED_BUILD_WORKFLOW_PATH}"',
    );
    expect(completedRun).toContain(
      'test "${EXPECTED_BUILD_WORKFLOW_PATH}" = ".github/workflows/build-docker-images.yml"',
    );
    expect(completedRun).toContain(
      'test "$(jq -r \'.event\' <<< "${run_json}")" = "${EXPECTED_BUILD_EVENT}"',
    );
    expect(completedRun).toContain(
      'test "$(jq -r \'.conclusion\' <<< "${run_json}")" = success',
    );
    expect(completedRun).toContain(
      'test "$(jq -r \'.head_sha\' <<< "${run_json}")" = "${SOURCE_SHA}"',
    );
    expect(completedRun).toContain(
      'current_workflow_path="$(canonical_workflow_path "${current_run_json}")"',
    );
    expect(completedRun).toContain(
      'test "${current_workflow_path}" = ".github/workflows/auto-deploy-dev.yml"',
    );
    expect(completedRun).toContain(
      'test "${current_workflow_path}" = ".github/workflows/deploy-dev.yml"',
    );
    expect(evidence).toContain("*) exit 1 ;;");
    expect(manifestEvidence).toContain(
      'receipt_dir="${RUNNER_TEMP}/image-manifest-${INPUT_BUILD_RUN_ID}"',
    );
    expect(manifestEvidence).toContain(
      'test "$(jq -r \'.commit_sha\' "${manifest}")" = "${SOURCE_SHA}"',
    );
    expect(manifestEvidence).toContain(
      'test "$(jq -r \'.target_environment\' "${manifest}")" = development',
    );
    expect(manifestEvidence).toContain('^sha256:[a-f0-9]{64}$');
  });

  test("never trusts a run path that can spoof an at-sign workflow filename", () => {
    const trustedPath = ".github/workflows/release-dev.yml";
    const spoofedRunPath = `${trustedPath}@shadow.yml@main`;

    expect(spoofedRunPath.split("@")[0]).toBe(trustedPath);
    expect(spoofedRunPath).not.toBe(trustedPath);
    expect(deployDevWorkflow).not.toContain('.path | split("@")[0]');
    expect(deployDevWorkflow).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_id}"',
    );
  });

  test("keeps every automatic deployment on completed build-run evidence", () => {
    const deployApi = sliceWorkflowJob(autoDeployDevWorkflow, "deploy-api", "api-ready");
    const deployRest = sliceWorkflowJob(autoDeployDevWorkflow, "deploy-rest", "rest-ready");
    const deployWeb = sliceWorkflowJob(autoDeployDevWorkflow, "deploy-web", "summary");

    for (const [job, service] of [
      [deployApi, "api"],
      [deployRest, "${{ matrix.service }}"],
      [deployWeb, "web"],
    ]) {
      expect(job).toContain("uses: ./.github/workflows/deploy-dev.yml");
      expect(job).toContain(`service: ${service}`);
      expect(job).toContain(
        "commit_sha: ${{ needs.authorize.outputs.commit_sha }}",
      );
      expect(job).toContain(
        "build_run_id: ${{ needs.authorize.outputs.build_run_id }}",
      );
      expect(job).toContain("expected_build_event: push");
      expect(job).toContain("evidence_mode: completed_run");
      expect(job).toContain(
        "expected_build_workflow_path: .github/workflows/build-docker-images.yml",
      );
    }
    expect(deployApi).toContain("needs: [authorize, migration]");
    expect(deployRest).toContain("needs: [authorize, api-ready]");
    expect(deployRest).toContain("max-parallel: 1");
    expect(deployWeb).toContain("needs: [authorize, web-gate]");
    expect(deployWeb).toContain(
      "gate_receipt_b64: ${{ needs.web-gate.outputs.receipt_b64 }}",
    );
    expect(autoDeployDevWorkflow).toContain("types: [completed]");
    expect(autoDeployDevWorkflow).toContain("branches: [main]");
    expect(autoDeployDevWorkflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(autoDeployDevWorkflow).toContain("github.event.workflow_run.event == 'push'");
  });
});

describe("production orchestrator", () => {
  test("separates candidate build and evidence-bound deployment", () => {
    const triggerEnd = releaseProductionWorkflow.indexOf("permissions:");
    const trigger = releaseProductionWorkflow.slice(0, triggerEnd);

    expect(releaseProductionWorkflow).toContain("name: Release Production");
    expect(releaseProductionWorkflow).toContain("options: [build, deploy]");
    expect(trigger).toContain("workflow_dispatch:");
    expect(trigger).not.toContain("workflow_call:");
    expect(trigger).not.toContain("workflow_run:");
    expect(trigger).not.toContain("\n  push:");
    for (const [input, nextInput] of [
      ["operation", "service"],
      ["service", "build_run_id"],
      ["confirm_text", "reason"],
    ]) {
      const start = trigger.indexOf(`      ${input}:`);
      const end = trigger.indexOf(`      ${nextInput}:`, start + 1);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      expect(trigger.slice(start, end)).toContain("required: true");
    }
    expect(releaseProductionWorkflow).toContain("contents: read");
    expect(releaseProductionWorkflow).toContain("actions: read");
    expect(releaseProductionWorkflow).toContain("target_environment: production");
    expect(releaseProductionWorkflow).toContain("production-release-candidate");
    expect(releaseProductionWorkflow).toContain("production-deployment-receipt-");
    expect(releaseProductionWorkflow).toContain("verify-production-release-candidate.mjs");
    expect(releaseProductionWorkflow).toContain("confirm_text:");
    expect(releaseProductionWorkflow).toContain("cancel-in-progress: false");
    expect(releaseProductionWorkflow).toContain("format('tag-{0}', github.ref_name)");
    expect(releaseProductionWorkflow).toContain("format('candidate-{0}', inputs.build_run_id)");
    expect(releaseProductionWorkflow).not.toContain("\n    environment: production");
    expect(releaseProductionWorkflow).not.toContain("target_environment: development");
    expect(releaseProductionWorkflow).not.toContain('"web"');
  });

  test("requires exact build and deploy authorization before reusable calls", () => {
    const prepareBuild = sliceWorkflowJob(releaseProductionWorkflow, "prepare-build", "build");
    const build = sliceWorkflowJob(releaseProductionWorkflow, "build", "candidate");
    const authorize = sliceWorkflowJob(releaseProductionWorkflow, "authorize-deploy", "deploy");
    const deploy = sliceWorkflowJob(releaseProductionWorkflow, "deploy", "summary");

    expect(prepareBuild).toContain('test "${GITHUB_REF_TYPE}" = tag');
    expect(prepareBuild).toContain('test "${CONFIRM_TEXT}" = "确认构建生产候选"');
    expect(prepareBuild).toContain('[[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]]');
    expect(prepareBuild).toContain('^v[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}\\.[0-9]+$');
    expect(prepareBuild).toContain("resolve-admin-release-services.mjs requested");
    expect(prepareBuild).toContain("resolve-admin-release-services.mjs build");
    expect(build).toContain("uses: ./.github/workflows/build-docker-images.yml");
    expect(build).toContain("target_environment: production");
    expect(build).toContain("service: ${{ needs.prepare-build.outputs.requested_services }}");

    expect(authorize).toContain('test "${CONFIRM_TEXT}" = "确认部署生产环境"');
    expect(authorize).toContain('[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]');
    expect(authorize).toContain('[[ "${COMMIT_SHA}" =~ ^[a-f0-9]{40}$ ]]');
    expect(authorize).toContain('test "${GITHUB_SHA}" = "${COMMIT_SHA}"');
    expect(deploy).toContain("uses: ./.github/workflows/deploy-docker-services.yml");
    expect(deploy).toContain("service: ${{ needs.authorize-deploy.outputs.requested_services }}");
    expect(deploy).toContain("build_run_id: ${{ inputs.build_run_id }}");
    expect(deploy).toContain("built_image_sha: ${{ inputs.commit_sha }}");
    expect(deploy).toContain("confirm_text: 确认部署生产环境");
    expect(deploy).not.toContain("upload-artifact");
  });

  test("binds candidate and receipt evidence to the canonical workflow identity", () => {
    const candidate = sliceWorkflowJob(releaseProductionWorkflow, "candidate", "authorize-deploy");
    const authorize = sliceWorkflowJob(releaseProductionWorkflow, "authorize-deploy", "deploy");

    expect(candidate).toContain('gh run download "${GITHUB_RUN_ID}" -n production-build-plan');
    expect(candidate).toContain('gh run download "${GITHUB_RUN_ID}" -n "image-manifest-${service}"');
    expect(candidate).toContain("verify-production-release-candidate.mjs");
    expect(candidate).toContain("name: production-release-candidate");
    expect(candidate.indexOf("verify-production-release-candidate.mjs")).toBeLessThan(
      candidate.indexOf("name: production-release-candidate"),
    );
    expect(candidate.trimEnd()).toEndWith("retention-days: 30");

    expect(authorize).toContain("canonical_workflow_path() {");
    expect(authorize).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_id}"',
    );
    expect(authorize).toContain(
      'test "${build_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(authorize).not.toContain('.path | split("@")[0]');
    expect(authorize).toContain('gh run download "${BUILD_RUN_ID}" -n production-release-candidate');
    expect(authorize).toContain('gh run download "${BUILD_RUN_ID}" -n production-build-plan');
    expect(authorize).toContain('gh run download "${BUILD_RUN_ID}" -n "image-manifest-${service}"');
    expect(authorize).toContain("verify-production-release-candidate.mjs");
    expect(authorize).toContain(
      'test "$(jq -r ".event" <<< "${run_json}")" = workflow_dispatch',
    );
    expect(authorize).toContain(
      'test "$(jq -r ".conclusion" <<< "${run_json}")" = success',
    );
    expect(authorize).toContain(
      'test "$(jq -r ".head_sha" <<< "${run_json}")" = "${COMMIT_SHA}"',
    );
    expect(authorize).toContain('test "$(jq -r \'.tag\' "${evidence_dir}/verified-candidate.json")" = "${GITHUB_REF_NAME}"');
    expect(authorize).toContain("production-deployment-receipt-${BUILD_RUN_ID}");
    expect(authorize).toContain("expired == false");
  });

  test("revalidates candidate evidence inside the globally serialized production deploy", () => {
    const guardStart = deployProductionWorkflow.indexOf("- name: Guard production runner");
    const metadataStart = deployProductionWorkflow.indexOf("- name: Preflight Admin candidate metadata");
    const checkoutStart = deployProductionWorkflow.indexOf("- name: Checkout compose files");
    const evidenceStart = deployProductionWorkflow.indexOf("- name: Validate production release evidence");
    const dockerStart = deployProductionWorkflow.indexOf("- name: Ensure Docker daemon");
    const syncStart = deployProductionWorkflow.indexOf("- name: Sync compose fragments");
    const receiptStart = deployProductionWorkflow.indexOf("- name: Upload production deployment receipt");
    const containerHealthStart = deployProductionWorkflow.indexOf("- name: Check container health");
    const healthStart = deployProductionWorkflow.indexOf("- name: Check public endpoints and pre-cutover Web loopback");
    const guard = deployProductionWorkflow.slice(guardStart, metadataStart);
    const metadata = deployProductionWorkflow.slice(metadataStart, checkoutStart);
    const checkout = deployProductionWorkflow.slice(checkoutStart, evidenceStart);

    expect(deployProductionWorkflow).toContain("build_run_id:");
    expect(deployProductionWorkflow).toContain("group: deploy-docker-services-main");
    expect(deployProductionWorkflow).toContain("cancel-in-progress: false");
    expect(guardStart).toBeGreaterThanOrEqual(0);
    expect(metadataStart).toBeGreaterThan(guardStart);
    expect(checkoutStart).toBeGreaterThan(metadataStart);
    expect(evidenceStart).toBeGreaterThan(checkoutStart);
    expect(dockerStart).toBeGreaterThan(evidenceStart);
    expect(syncStart).toBeGreaterThan(dockerStart);
    expect(guard).toContain('SOURCE_DIR="${RUNNER_TEMP}/gooes-source-${GITHUB_RUN_ID}"');
    expect(guard).toContain('echo "SOURCE_DIR=${SOURCE_DIR}" >> "${GITHUB_ENV}"');
    expect(checkout).toContain('git clone --filter=blob:none --no-checkout "https://github.com/${GITHUB_REPOSITORY}.git" "${SOURCE_DIR}"');
    expect(checkout).toContain('git -C "${SOURCE_DIR}" fetch');
    expect(checkout).toContain('git -C "${SOURCE_DIR}" clean -fdx');
    expect(deployProductionWorkflow).not.toContain("${RUNNER_WORKSPACE}/source");
    expect(metadata).toContain('if [ -z "${BUILD_RUN_ID}" ]; then');
    expect(metadata.indexOf('if [ -z "${BUILD_RUN_ID}" ]; then')).toBeLessThan(
      metadata.indexOf('[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]'),
    );
    expect(metadata).toContain('[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]');
    expect(metadata).toContain('[[ "${INPUT_BUILT_IMAGE_SHA}" =~ ^[a-f0-9]{40}$ ]]');
    expect(metadata).toContain('test "${INPUT_BUILT_IMAGE_SHA}" = "${GITHUB_SHA}"');
    expect(metadata).toContain("canonical_workflow_path() {");
    expect(metadata).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_id}"',
    );
    expect(metadata).toContain(
      'test "${current_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(metadata).toContain(
      'test "${build_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(metadata).toContain("production-deployment-receipt-${BUILD_RUN_ID}");
    expect(metadata).toContain("expired == false");
    expect(metadata).not.toContain("${SOURCE_DIR}");
    expect(metadata).not.toContain("${DEPLOY_DIR}");
    expect(metadata).not.toContain("docker");
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      "verify-production-release-candidate.mjs",
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      "production-deployment-receipt-",
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      'gh run download "${BUILD_RUN_ID}" -n production-release-candidate',
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      'gh run download "${BUILD_RUN_ID}" -n production-build-plan',
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      'gh run download "${BUILD_RUN_ID}" -n "image-manifest-${service}"',
    );
    for (const image of [
      "GOOES_API_IMAGE=${image_base}/goose-api@${api_digest}",
      "GOOES_ADMIN_IMAGE=${image_base}/goose-admin@${admin_digest}",
      "GOOES_SOCIAL_VIDEO_WORKER_IMAGE=${image_base}/goose-social-video-worker@${social_video_worker_digest}",
    ]) {
      expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(image);
    }
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      'test "${current_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).not.toContain(
      '.path | split("@")[0]',
    );
    expect(deployProductionWorkflow).toContain('test "${GITHUB_REF_NAME}" = "main"');
    expect(deployProductionWorkflow).toContain('test "${GITHUB_REF_TYPE}" = tag');
    expect(deployProductionWorkflow).toContain('test "${INPUT_BUILT_IMAGE_SHA}" = "${GITHUB_SHA}"');
    expect(deployProductionWorkflow).toContain('test "${RELEASE_CONFIRM_TEXT}" = "确认部署生产环境"');
    expect(deployProductionWorkflow).toContain("runs-on: [self-hosted, Linux, X64, gooes-prod-deploy]");
    expect(deployProductionWorkflow).toContain("environment: production");
    expect(deployProductionWorkflow).toContain("DEPLOY_DIR: /opt/supabase/docker");
    expect(deployProductionWorkflow).toContain('test "${RUNNER_NAME}" = "gooes-prod-vm-0-3"');
    expect(containerHealthStart).toBeGreaterThan(dockerStart);
    expect(deployProductionWorkflow.slice(containerHealthStart, healthStart)).toContain(
      'test "${revision}" = "${SOURCE_SHA}"',
    );
    expect(receiptStart).toBeGreaterThan(healthStart);
    expect(deployProductionWorkflow.slice(receiptStart)).toContain("uses: actions/upload-artifact@v6");
    expect(deployProductionWorkflow.slice(receiptStart)).toContain(
      "production-deployment-receipt-${{ inputs.build_run_id }}",
    );
    expect(deployProductionWorkflow.slice(receiptStart + 1)).not.toContain("\n      - name:");
    for (const field of [
      "schema_version: 1",
      "build_run_id: $build_run_id",
      "deploy_run_id: $deploy_run_id",
      "tag: $tag",
      "commit_sha: $commit_sha",
      "services: ($services | split(\",\"))",
      "completed_at: $completed_at",
    ]) {
      expect(deployProductionWorkflow).toContain(field);
    }
  });

  test("pins Admin candidate images to verified manifest digests instead of mutable SHA tags", () => {
    const evidenceStart = deployProductionWorkflow.indexOf("- name: Validate production release evidence");
    const dockerStart = deployProductionWorkflow.indexOf("- name: Ensure Docker daemon");
    const evidence = deployProductionWorkflow.slice(evidenceStart, dockerStart);
    const shellVariable = (name: string) => `\${${name}}`;

    expect(evidenceStart).toBeGreaterThanOrEqual(0);
    expect(dockerStart).toBeGreaterThan(evidenceStart);
    for (const [service, variable] of [
      ["api", "GOOES_API_IMAGE"],
      ["admin", "GOOES_ADMIN_IMAGE"],
      ["social-video-worker", "GOOES_SOCIAL_VIDEO_WORKER_IMAGE"],
    ]) {
      const digestVariable = `${service.replaceAll("-", "_")}_digest`;
      expect(evidence).toContain(
        `${digestVariable}="$(jq -er '.digest | select(type == "string" and test("^sha256:[a-f0-9]{64}$"))' "${shellVariable("evidence_dir")}/image-manifest-${service}.json")"`,
      );
      expect(evidence).toContain(
        `${variable}=${shellVariable("image_base")}/goose-${service}@${shellVariable(digestVariable)}`,
      );
      expect(evidence).not.toContain(
        `${variable}=${shellVariable("image_base")}/goose-${service}:${shellVariable("GITHUB_SHA")}`,
      );
    }
    expect(evidence).toContain("GOOES_API_IMAGE=${image_base}/goose-api@${api_digest}");

    const repository = "ccr.example/gooes/goose-api";
    const sha = "a".repeat(40);
    const candidateDigest = `sha256:${"b".repeat(64)}`;
    const overwrittenDigest = `sha256:${"c".repeat(64)}`;
    const mutableShaTag = `${repository}:${sha}`;
    const candidateReference = `${repository}@${candidateDigest}`;
    const shaTagRegistryBefore = new Map([[mutableShaTag, candidateDigest]]);
    const shaTagRegistryAfter = new Map([[mutableShaTag, overwrittenDigest]]);
    const deploymentReferenceBeforeOverwrite = candidateReference;
    const deploymentReferenceAfterOverwrite = candidateReference;

    expect(`${repository}:${sha}`).toBe(mutableShaTag);
    expect(shaTagRegistryBefore.get(mutableShaTag)).not.toBe(
      shaTagRegistryAfter.get(mutableShaTag),
    );
    expect(deploymentReferenceAfterOverwrite).toBe(deploymentReferenceBeforeOverwrite);
    expect(candidateReference).toBe(`${repository}@${candidateDigest}`);
    expect(candidateReference).not.toContain(mutableShaTag);
  });
});
