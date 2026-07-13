import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, repositoryRoot), "utf8");

const dev = read(".github/workflows/deploy-dev.yml");
const devGate = read(".github/workflows/verify-dev-web-deployment-gate.yml");
const build = read(".github/workflows/build-docker-images.yml");
const production = read(".github/workflows/deploy-docker-services.yml");

const sliceStep = (workflow: string, name: string, nextName: string): string => {
  const start = workflow.indexOf(`- name: ${name}`);
  const end = workflow.indexOf(`- name: ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
};

const sliceSection = (workflow: string, startMarker: string, endMarker: string): string => {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
};

const namedStep = (workflow: string, name: string): string => {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = workflow.indexOf("\n      - ", start + 1);
  return workflow.slice(start, end < 0 ? undefined : end);
};

const inputSection = (trigger: string, input: string): string => {
  const start = trigger.indexOf(`      ${input}:`);
  expect(start).toBeGreaterThanOrEqual(0);
  const remaining = trigger.slice(start + 1);
  const nextInput = /\n      [a-z_]+:\n/.exec(remaining);
  const end = nextInput?.index === undefined ? -1 : start + 1 + nextInput.index;
  return trigger.slice(start, end < 0 ? undefined : end);
};

const runBlocks = (workflow: string): string[] => {
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
};

describe("web deployment hard gates", () => {
  test("keeps development deployment separate from immutable image builds", () => {
    const resolve = sliceStep(dev, "Resolve services", "Checkout repository");
    expect(resolve).toContain("DEPLOY_SERVICES=web");
    expect(resolve).toContain("MANIFEST_SERVICE=web");
    expect(dev).toContain("build_run_id:");
    expect(dev).not.toContain("docker build");
  });

  test("keeps manual deployment inputs and exposes the reusable single-service interface", () => {
    const call = sliceSection(dev, "  workflow_call:", "  workflow_dispatch:");
    const dispatch = sliceSection(dev, "  workflow_dispatch:", "permissions:");

    for (const input of ["service", "commit_sha", "build_run_id", "expected_build_event"]) {
      const section = inputSection(call, input);
      expect(section).toContain("required: true");
      expect(section).toContain("type: string");
    }
    const inlineReceipt = inputSection(call, "gate_receipt_b64");
    expect(inlineReceipt).toContain("required: false");
    expect(inlineReceipt).toContain("type: string");
    expect(inlineReceipt).toContain('default: ""');
    expect(call).not.toContain("gate_run_id:");

    const service = inputSection(dispatch, "service");
    expect(service).toContain("required: true");
    expect(service).toContain("type: choice");
    expect(service).toContain("options: [api, admin, web, social-video-worker, cos-reconcile-worker]");
    for (const input of ["commit_sha", "build_run_id"]) {
      const section = inputSection(dispatch, input);
      expect(section).toContain("required: true");
      expect(section).toContain("type: string");
    }
    const gateRun = inputSection(dispatch, "gate_run_id");
    expect(gateRun).toContain("required: false");
    expect(gateRun).toContain("type: string");
  });

  test("binds build evidence to an allowed event and the exact caller workflow run", () => {
    const evidence = sliceStep(
      dev,
      "Validate immutable build evidence",
      "Validate gated dev web deployment",
    );
    const splitStart = evidence.indexOf('case "${EVIDENCE_MODE}" in');
    const sameRunStart = evidence.indexOf("same_run)", splitStart);
    const completedRunStart = evidence.indexOf("completed_run)", sameRunStart);
    const splitEnd = evidence.indexOf(
      "\n          esac\n          receipt_dir=",
      completedRunStart,
    );
    const sameRun = evidence.slice(sameRunStart, completedRunStart);
    const completedRun = evidence.slice(completedRunStart, splitEnd);
    const manifestEvidence = evidence.slice(splitEnd);

    expect(dev).toContain(
      "EXPECTED_BUILD_EVENT: ${{ github.event_name == 'workflow_dispatch' && 'workflow_dispatch' || inputs.expected_build_event }}",
    );
    expect(dev).toContain("EVIDENCE_MODE: ${{ inputs.evidence_mode || 'completed_run' }}");
    expect(dev).toContain(
      "EXPECTED_BUILD_WORKFLOW_PATH: ${{ inputs.expected_build_workflow_path || '.github/workflows/build-docker-images.yml' }}",
    );
    expect(dev).toContain("INLINE_GATE_RECEIPT_B64: ${{ inputs.gate_receipt_b64 }}");
    expect(evidence).toContain('[[ "${INPUT_BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]');
    expect(splitStart).toBeGreaterThanOrEqual(0);
    expect(sameRunStart).toBeGreaterThan(splitStart);
    expect(completedRunStart).toBeGreaterThan(sameRunStart);
    expect(splitEnd).toBeGreaterThan(completedRunStart);
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

    expect(sameRun).toContain('test "${INPUT_BUILD_RUN_ID}" = "${GITHUB_RUN_ID}"');
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
    expect(sameRun).toContain('test "${GITHUB_EVENT_NAME}" = workflow_dispatch');
    expect(sameRun).toContain('test -z "${INLINE_GATE_RECEIPT_B64}"');

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
    expect(completedRun).toContain('test "${GITHUB_EVENT_NAME}" = workflow_run');
    expect(completedRun).toContain(
      'current_workflow_path="$(canonical_workflow_path "${current_run_json}")"',
    );
    expect(completedRun).toContain(
      'test "${current_workflow_path}" = ".github/workflows/auto-deploy-dev.yml"',
    );
    expect(completedRun).toContain(
      'test "$(jq -r \'.event\' <<< "${current_run_json}")" = workflow_run',
    );
    expect(completedRun).toContain(
      'test "${current_workflow_path}" = ".github/workflows/deploy-dev.yml"',
    );
    expect(completedRun).toContain(
      'test "$(jq -r \'.event\' <<< "${current_run_json}")" = workflow_dispatch',
    );
    expect(completedRun).toContain('test -z "${INLINE_GATE_RECEIPT_B64}"');
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
    expect(evidence).not.toContain("github.workflow_ref");
  });

  test("requires exact dev evidence before the dedicated web deploy step", () => {
    const gate = sliceStep(dev, "Validate gated dev web deployment", "Deploy gated dev web");
    const deploy = sliceStep(dev, "Deploy gated dev web", "Check gated dev web");
    expect(gate).toContain("verify-dev-web-deployment-gate.yml");
    expect(gate).toContain("verify-web-gate-receipt.mjs");
    expect(gate).toContain('"${SOURCE_SHA}" 20260711120000');
    expect(gate).toContain('test "${INPUT_SERVICE}" = "web"');
    expect(deploy).toContain("gooes-web-dev");
    expect(dev.indexOf("Validate gated dev web deployment")).toBeLessThan(dev.indexOf("Deploy gated dev web"));
  });

  test("accepts exactly one manual or automatic Web gate receipt source", () => {
    const gate = sliceStep(dev, "Validate gated dev web deployment", "Sync compose files");

    expect(gate).toContain("INLINE_GATE_RECEIPT_B64: ${{ inputs.gate_receipt_b64 }}");
    expect(gate).toContain('if [ -n "${INLINE_GATE_RECEIPT_B64}" ]; then');
    expect(gate).toContain('test "${EXPECTED_BUILD_EVENT}" = push');
    expect(gate).toContain('test "${GITHUB_EVENT_NAME}" = workflow_run');
    expect(gate).toContain('test -z "${INPUT_GATE_RUN_ID}"');
    expect(gate).toContain(
      "printf '%s' \"${INLINE_GATE_RECEIPT_B64}\" | base64 -d > \"${receipt_file}\"",
    );
    expect(gate).toContain('test "${EXPECTED_BUILD_EVENT}" = workflow_dispatch');
    expect(gate).toContain('test "${GITHUB_EVENT_NAME}" = workflow_dispatch');
    expect(gate).toContain('test -z "${INLINE_GATE_RECEIPT_B64}"');
    expect(gate).toContain('[[ "${INPUT_GATE_RUN_ID}" =~ ^[1-9][0-9]*$ ]]');
    expect(gate).toContain("verify-dev-web-deployment-gate.yml");
    expect(gate).toContain('test "$(jq -r \'.conclusion\' <<< "${run_json}")" = "success"');
    expect(gate).toContain('test "$(jq -r \'.head_sha\' <<< "${run_json}")" = "${SOURCE_SHA}"');
    expect(gate).toContain("gh run download");
    expect(gate).toContain("-n web-deployment-gate-receipt");
    expect(gate).toContain(
      'node scripts/verify-web-gate-receipt.mjs \\\n            "${receipt_file}" development "${SOURCE_SHA}" 20260711120000',
    );
    expect(gate).not.toMatch(/echo[^\n]*(?:INLINE_GATE_RECEIPT_B64|receipt_file)/);
    expect(gate).not.toMatch(/cat\s+[^\n]*receipt/);
    expect(dev.indexOf("verify-web-gate-receipt.mjs")).toBeLessThan(dev.indexOf("docker compose"));
  });

  test("does not require Web gate evidence for non-Web services", () => {
    const gate = namedStep(dev, "Validate gated dev web deployment");
    expect(gate).toContain("if: ${{ inputs.service == 'web' }}");
    expect(namedStep(dev, "Deploy dev services")).toContain(
      "if: ${{ inputs.service != 'web' }}",
    );
  });

  test("never interpolates deployment inputs directly into shell", () => {
    for (const block of runBlocks(dev)) {
      expect(block).not.toMatch(/\$\{\{\s*(?:github\.event\.)?inputs\./);
    }
  });

  test("keeps manual inputs while exposing a reusable development web gate receipt", () => {
    const call = sliceSection(devGate, "  workflow_call:", "  workflow_dispatch:");
    const dispatch = sliceSection(devGate, "  workflow_dispatch:", "permissions:");

    for (const input of ["commit_sha", "migration_version"]) {
      const nextMarker = input === "commit_sha" ? "      migration_version:" : "    outputs:";
      const callInput = sliceSection(call, `      ${input}:`, nextMarker);
      const dispatchInput = input === "commit_sha"
        ? sliceSection(dispatch, `      ${input}:`, "      migration_version:")
        : dispatch.slice(dispatch.indexOf(`      ${input}:`));
      expect(callInput).toContain("required: true");
      expect(callInput).toContain("type: string");
      expect(dispatchInput).toContain("required: true");
      expect(dispatchInput).toContain("type: string");
    }
    expect(dispatch).toContain('default: "20260711120000"');
    expect(call).toContain("receipt_b64:");
    expect(call).toContain("value: ${{ jobs.verify.outputs.receipt_b64 }}");
    expect(devGate).toContain("permissions:\n  contents: read");
    expect(devGate).toContain("cancel-in-progress: false");
  });

  test("delegates development migration history to the reusable migration gate", () => {
    const migration = sliceSection(devGate, "  migration:", "  verify:");
    const verifyHeader = sliceSection(devGate, "  verify:", "    steps:");
    const evidence = namedStep(devGate, "Verify reusable development migration evidence");

    expect(migration).toContain("uses: ./.github/workflows/verify-dev-migration-history.yml");
    expect(migration).toContain("commit_sha: ${{ inputs.commit_sha }}");
    expect(migration).toContain("migration_version: ${{ inputs.migration_version }}");
    expect(migration).toContain("artifact_name: web-gate-migration-${{ inputs.commit_sha }}");
    expect(migration).toContain("secrets: inherit");
    expect(verifyHeader).toContain("needs: migration");
    expect(evidence).toContain(
      "MIGRATION_EVIDENCE_B64: ${{ needs.migration.outputs.evidence_b64 }}",
    );
    expect(evidence).toContain('test -n "${MIGRATION_EVIDENCE_B64}"');
    expect(evidence).toContain(
      "printf '%s' \"${MIGRATION_EVIDENCE_B64}\" | base64 -d > migration-evidence.json",
    );
    expect(evidence).toContain("scripts/verify-dev-migration-evidence.mjs");
    expect(evidence).toContain(
      'migration-evidence.json development "${GATE_COMMIT_SHA}" "${GATE_MIGRATION_VERSION}"',
    );
    expect(devGate).not.toContain("pnpm dlx supabase@2.99.0 migration list");
    expect(devGate).not.toContain("SUPABASE_DB_URL");
    expect(devGate).not.toContain("source .env.dev.db");
    expect(devGate).not.toContain(". /opt/gooes-dev/docker/.env.dev.db");
  });

  test("self-verifies and exports the immutable development web gate receipt", () => {
    const verifyHeader = sliceSection(devGate, "  verify:", "    steps:");
    const receipt = namedStep(devGate, "Create immutable gate receipt");

    expect(verifyHeader).toContain("receipt_b64: ${{ steps.receipt.outputs.receipt_b64 }}");
    expect(receipt).toContain("id: receipt");
    expect(receipt).toContain("--slurpfile migrationEvidence migration-evidence.json");
    expect(receipt).toContain("scripts/verify-web-gate-receipt.mjs");
    expect(receipt).toContain(
      'web-deployment-gate-receipt.json development "${RECEIPT_COMMIT_SHA}" "${RECEIPT_MIGRATION_VERSION}"',
    );
    expect(receipt).toContain("base64 -w0 web-deployment-gate-receipt.json");
    expect(receipt).toContain("printf 'receipt_b64=%s\\n'");
    expect(receipt).toContain('>> "${GITHUB_OUTPUT}"');
    expect(devGate).toContain("uses: actions/upload-artifact@v6");
    expect(devGate).toContain("name: web-deployment-gate-receipt");
    expect(devGate).toContain("retention-days: 14");
  });

  test("does not let normal dev deploy or health steps report web success", () => {
    const deploy = sliceStep(dev, "Deploy dev services", "Check dev services");
    const check = sliceStep(dev, "Check dev services", "Deploy gated dev web");
    expect(deploy).not.toContain("gooes-web-dev");
    expect(deploy).not.toContain("REMOTE_GOOES_WEB_IMAGE");
    expect(check).not.toContain("www-dev.goodcms.cn/partners");
  });

  test("validates production evidence before any web compose pull or up", () => {
    const gate = sliceStep(production, "Validate web deployment gate", "Sync compose fragments");
    const pull = sliceStep(production, "Pull latest images", "Recreate services");
    const recreate = sliceStep(production, "Recreate services", "Check container health");
    expect(gate).toContain("scripts/resolve-web-deployment.mjs");
    expect(gate).toContain('"${INPUT_GATE_RUN_ID}"');
    expect(gate).toContain("verify-web-gate-receipt.mjs");
    expect(gate).toContain('"${SOURCE_SHA}"');
    expect(gate).toContain('echo "DEPLOY_SERVICES=${DEPLOY_SERVICES}"');
    expect(pull).toContain("gooes-web");
    expect(recreate).toContain("gooes-web");
    expect(production.indexOf("Validate web deployment gate")).toBeLessThan(production.indexOf("gooes-web"));
  });

  test("keeps build evidence and production gate evidence independent", () => {
    expect(build).toContain("image-manifest-${SERVICE}.json");
    expect(build).not.toContain("uses: ./.github/workflows/deploy-docker-services.yml");
    expect(production).toContain("gate_run_id:");
    expect(production).toContain("verify-web-gate-receipt.mjs");
    expect(`${build}\n${production}`).not.toMatch(
      /(?:verified_commit_sha|sms_smoke_confirmation):/,
    );
  });

  test("all builds web while normalized deployment keeps every legacy service", () => {
    const matrix = build.slice(build.indexOf("matrix:"), build.indexOf("steps:", build.indexOf("matrix:")));
    const pull = sliceStep(production, "Pull latest images", "Recreate services");
    expect(matrix).toContain("service: web");
    expect(build).toContain("resolve-web-deployment.mjs build");
    expect(build).toContain("needs.validate-request.outputs.build_services");
    expect(pull).toContain("for item in ${DEPLOY_SERVICES}");
    for (const service of ["api", "admin", "social-video-worker", "cos-reconcile-worker"]) {
      expect(pull).toContain(`${service}) compose_services+=`);
    }
  });
});
