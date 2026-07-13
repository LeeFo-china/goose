import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const buildWorkflow = readFileSync(
  new URL("../.github/workflows/build-docker-images.yml", import.meta.url),
  "utf8",
);
const autoDeployDevWorkflow = readFileSync(
  new URL("../.github/workflows/auto-deploy-dev.yml", import.meta.url),
  "utf8",
);

const script = new URL("./resolve-admin-release-services.mjs", import.meta.url).pathname;

function resolve(mode: string, services: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(["node", script, mode, services], {
    stderr: "pipe",
    stdout: "pipe",
  });
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
