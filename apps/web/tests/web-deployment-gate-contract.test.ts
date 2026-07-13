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

describe("web deployment hard gates", () => {
  test("keeps development deployment separate from immutable image builds", () => {
    const resolve = sliceStep(dev, "Resolve services", "Checkout repository");
    expect(resolve).toContain("DEPLOY_SERVICES=web");
    expect(resolve).toContain("MANIFEST_SERVICE=web");
    expect(dev).toContain("build_run_id:");
    expect(dev).not.toContain("docker build");
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
