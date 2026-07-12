import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const repositoryRoot = new URL("../../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, repositoryRoot), "utf8");

const dev = read(".github/workflows/deploy-dev.yml");
const build = read(".github/workflows/build-docker-images.yml");
const production = read(".github/workflows/deploy-docker-services.yml");

const sliceStep = (workflow: string, name: string, nextName: string): string => {
  const start = workflow.indexOf(`- name: ${name}`);
  const end = workflow.indexOf(`- name: ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
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
