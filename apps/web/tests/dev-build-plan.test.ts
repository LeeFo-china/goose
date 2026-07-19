import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

const script = new URL("../../../scripts/verify-dev-build-plan.mjs", import.meta.url).pathname;
const expectedSha = "a".repeat(40);
const expectedRunId = "12345";
const roots: string[] = [];

const validPlan = {
  schema_version: 1,
  target_environment: "development",
  commit_sha: expectedSha,
  before_sha: "b".repeat(40),
  workflow_run_id: 12345,
  migration_changed: false,
  changed_files: ["apps/api/src/app.ts"],
  classifications: ["api"],
  build_services: ["api", "social-video-worker"],
  deploy_services: [
    "api",
    "social-video-worker",
    "cos-reconcile-worker",
    "billing-reconcile-worker",
  ],
  no_op: false,
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function runCli(
  plan: unknown,
  { raw = false, args }: { raw?: boolean; args?: string[] } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "dev-build-plan-"));
  roots.push(root);
  const planPath = join(root, "plan.json");
  writeFileSync(planPath, raw ? String(plan) : JSON.stringify(plan));

  const cliArgs = (args ?? [planPath, expectedSha, expectedRunId]).map((arg) =>
    arg === "PLAN_PATH" ? planPath : arg,
  );
  const result = Bun.spawnSync([
    "node",
    script,
    ...cliArgs,
  ]);

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString("utf8"),
    stdout: result.stdout.toString("utf8"),
    planPath,
  };
}

function clonePlan(): typeof validPlan {
  return structuredClone(validPlan);
}

describe("development build plan verifier", () => {
  test("accepts an immutable plan and emits exactly one canonical JSON line", () => {
    const result = runCli(validPlan);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`${JSON.stringify(validPlan)}\n`);
    expect(JSON.parse(result.stdout)).toEqual(validPlan);
  });

  test("accepts a canonical no-op plan and extra builds in fixed order", () => {
    const noOpPlan = {
      ...clonePlan(),
      changed_files: ["docs/readme.md"],
      classifications: ["non-runtime"],
      build_services: [],
      deploy_services: [],
      no_op: true,
    };
    const fallbackPlan = {
      ...clonePlan(),
      classifications: ["fallback-all"],
      build_services: ["api", "admin", "web", "social-video-worker"],
      deploy_services: ["api", "web"],
    };

    expect(runCli(noOpPlan).exitCode).toBe(0);
    expect(runCli(fallbackPlan).exitCode).toBe(0);
  });

  test.each([
    ["unsupported schema", { schema_version: 2 }],
    ["production environment", { target_environment: "production" }],
    ["malformed commit SHA", { commit_sha: "bad" }],
    ["mismatched commit SHA", { commit_sha: "c".repeat(40) }],
    ["malformed before SHA", { before_sha: "BAD" }],
    ["mismatched workflow run", { workflow_run_id: 99999 }],
    ["unknown build service", { build_services: ["api", "unknown"] }],
    ["unknown deploy service", { deploy_services: ["api", "unknown"] }],
    ["web deploy without API", { deploy_services: ["web"] }],
    ["false no-op with no services", { build_services: [], deploy_services: [], no_op: false }],
    ["web build and deploy without API", { build_services: ["web"], deploy_services: ["web"] }],
    ["build without deploy evidence", { deploy_services: [] }],
    ["deploy without build evidence", { build_services: [] }],
    ["duplicate build service", { build_services: ["api", "api", "social-video-worker"] }],
    [
      "duplicate deploy service",
      { deploy_services: ["api", "social-video-worker", "social-video-worker", "cos-reconcile-worker"] },
    ],
    ["unordered build services", { build_services: ["social-video-worker", "api"] }],
    [
      "unordered deploy services",
      { deploy_services: ["social-video-worker", "api", "cos-reconcile-worker"] },
    ],
    ["non-boolean migration flag", { migration_changed: "false" }],
    ["non-boolean no-op flag", { no_op: 0 }],
    ["zero workflow run", { workflow_run_id: 0 }],
    ["fractional workflow run", { workflow_run_id: 12345.5 }],
    ["unsafe workflow run", { workflow_run_id: Number.MAX_SAFE_INTEGER + 1 }],
    ["string workflow run", { workflow_run_id: "12345" }],
  ])("rejects %s", (_name, override) => {
    const result = runCli({ ...clonePlan(), ...override });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test.each([
    ["unordered paths", ["apps/web/app/page.tsx", "apps/api/src/app.ts"]],
    ["duplicate paths", ["apps/api/src/app.ts", "apps/api/src/app.ts"]],
    ["empty path", [""]],
    ["backslash path", ["apps\\api\\src\\app.ts"]],
    ["absolute path", ["/apps/api/src/app.ts"]],
    ["dot segment", ["apps/./api/src/app.ts"]],
    ["parent segment", ["apps/api/../web/app/page.tsx"]],
    ["non-string path", [123]],
  ])("rejects changed_files with %s", (_name, changedFiles) => {
    const result = runCli({ ...clonePlan(), changed_files: changedFiles });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
  });

  test.each([
    ["unordered values", ["web", "api"]],
    ["duplicate values", ["api", "api"]],
    ["unknown value", ["other"]],
    ["empty value", [""]],
    ["non-string value", [1]],
  ])("rejects classifications with %s", (_name, classifications) => {
    expect(runCli({ ...clonePlan(), classifications }).exitCode).toBe(1);
  });

  test.each([
    ["admin deploy without admin build", ["api", "social-video-worker"], ["api", "admin"]],
    ["web deploy without web build", ["api", "social-video-worker"], ["api", "web"]],
    ["worker deploy without worker build", ["api"], ["api", "social-video-worker"]],
    ["COS deploy without API build", ["social-video-worker"], ["social-video-worker", "cos-reconcile-worker"]],
    [
      "billing reconcile deploy without API build",
      ["social-video-worker"],
      ["social-video-worker", "billing-reconcile-worker"],
    ],
  ])("rejects %s", (_name, buildServices, deployServices) => {
    const result = runCli({
      ...clonePlan(),
      build_services: buildServices,
      deploy_services: deployServices,
    });

    expect(result.exitCode).toBe(1);
  });

  test("rejects unknown and missing top-level fields", () => {
    const withUnknownField = { ...clonePlan(), injected: true };
    const missingField = clonePlan() as Partial<typeof validPlan>;
    delete missingField.before_sha;

    expect(runCli(withUnknownField).exitCode).toBe(1);
    expect(runCli(missingField).exitCode).toBe(1);
  });

  test("rejects non-array collection fields", () => {
    for (const override of [
      { changed_files: "apps/api/src/app.ts" },
      { classifications: "api" },
      { build_services: "api" },
      { deploy_services: "api" },
    ]) {
      expect(runCli({ ...clonePlan(), ...override }).exitCode).toBe(1);
    }
  });

  test("fails closed for invalid JSON without leaking its contents", () => {
    const secret = "do-not-leak-this-plan-content";
    const result = runCli(`{\"secret\":\"${secret}\"`, { raw: true });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(secret);
  });

  test.each([
    ["missing all arguments", []],
    ["missing expected run ID", ["PLAN_PATH", expectedSha]],
    ["extra argument", ["PLAN_PATH", expectedSha, expectedRunId, "extra"]],
  ])("rejects %s", (_name, args) => {
    const result = runCli(validPlan, { args });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
  });

  test.each([
    ["malformed SHA", "bad", expectedRunId],
    ["uppercase SHA", "A".repeat(40), expectedRunId],
    ["whitespace SHA", ` ${expectedSha}`, expectedRunId],
    ["scientific run ID", expectedSha, "1e3"],
    ["empty run ID", expectedSha, ""],
    ["leading whitespace run ID", expectedSha, " 12345"],
    ["trailing whitespace run ID", expectedSha, "12345 "],
    ["zero run ID", expectedSha, "0"],
    ["unsafe run ID", expectedSha, "9007199254740992"],
  ])("rejects non-canonical expected metadata: %s", (_name, sha, runId) => {
    const result = runCli(validPlan, { args: ["PLAN_PATH", sha, runId] });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
  });
});
