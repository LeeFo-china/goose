import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";

import { resolveDevChangePlan } from "../../../scripts/resolve-dev-change-plan.mjs";

const scriptUrl = new URL("../../../scripts/resolve-dev-change-plan.mjs", import.meta.url);
const script = scriptUrl.pathname;
const metadata = {
  beforeSha: "1".repeat(40),
  commitSha: "2".repeat(40),
  workflowRunId: 12345,
};

type MetadataEnvironment = Partial<Record<"BEFORE_SHA" | "COMMIT_SHA" | "WORKFLOW_RUN_ID", string | undefined>>;

function runCli(input: string, overrides: MetadataEnvironment = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BEFORE_SHA: metadata.beforeSha,
    COMMIT_SHA: metadata.commitSha,
    WORKFLOW_RUN_ID: String(metadata.workflowRunId),
  };

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }

  return spawnSync("node", [script], { encoding: "utf8", env, input });
}

describe("development change plan", () => {
  test.each([
    ["web runtime", ["apps/web/components/official-site/site-footer.tsx"], ["api", "web"], ["api", "web"]],
    [
      "api runtime",
      ["apps/api/src/app.ts"],
      ["api", "social-video-worker"],
      [
        "api",
        "social-video-worker",
        "cos-reconcile-worker",
        "billing-reconcile-worker",
      ],
    ],
    ["admin runtime", ["apps/admin/app/page.tsx"], ["admin"], ["admin"]],
    [
      "domain runtime",
      ["packages/domain/src/index.ts"],
      ["api", "admin", "web", "social-video-worker"],
      [
        "api",
        "admin",
        "web",
        "social-video-worker",
        "cos-reconcile-worker",
        "billing-reconcile-worker",
      ],
    ],
  ])("maps %s", (_name, paths, buildServices, deployServices) => {
    const plan = resolveDevChangePlan(paths as string[], metadata);

    expect(plan).toMatchObject({
      schema_version: 1,
      target_environment: "development",
      commit_sha: metadata.commitSha,
      before_sha: metadata.beforeSha,
      workflow_run_id: metadata.workflowRunId,
      migration_changed: false,
    });
    expect(plan.build_services).toEqual(buildServices);
    expect(plan.deploy_services).toEqual(deployServices);
    expect(plan.no_op).toBe(false);
  });

  test("deduplicates combined paths and marks migrations without applying them", () => {
    const plan = resolveDevChangePlan([
      "supabase/migrations/20260713120000_example.sql",
      "apps\\web\\app\\page.tsx",
      "apps/api/src/app.ts",
      "apps/web/app/page.tsx",
    ], metadata);

    expect(plan.changed_files).toEqual([
      "apps/api/src/app.ts",
      "apps/web/app/page.tsx",
      "supabase/migrations/20260713120000_example.sql",
    ]);
    expect(plan.build_services).toEqual(["api", "web", "social-video-worker"]);
    expect(plan.deploy_services).toEqual([
      "api",
      "web",
      "social-video-worker",
      "cos-reconcile-worker",
      "billing-reconcile-worker",
    ]);
    expect(plan.migration_changed).toBe(true);
    expect(plan.classifications).toEqual(["api", "migration", "web"]);
  });

  test("returns no-op for docs, tests, lighthouse and workflow-only changes", () => {
    const plan = resolveDevChangePlan([
      "docs/readme.md",
      "apps/web/tests/example.test.ts",
      "apps/h5/tests/example.test.ts",
      "apps/web/lighthouse-summary.json",
      ".github/workflows/example.yml",
      ".codex/skills/example.md",
      ".agents/skills/example.md",
      "scripts/resolve-dev-change-plan.mjs",
      "scripts/verify-dev-build-plan.mjs",
      "scripts/validate-dev-database-target.mjs",
      "scripts/verify-dev-migration-evidence.mjs",
      "scripts/verify-migration-history.mjs",
      "scripts/validate-web-gate-inputs.mjs",
      "scripts/verify-web-gate-receipt.mjs",
    ], metadata);

    expect(plan.no_op).toBe(true);
    expect(plan.build_services).toEqual([]);
    expect(plan.deploy_services).toEqual([]);
    expect(plan.classifications).toEqual(["non-runtime"]);
  });

  test("fails closed for H5 and dev Nginx while expanding unknown runtime paths", () => {
    expect(() => resolveDevChangePlan(["apps/h5/src/main.js"], metadata)).toThrow(
      "unsupported automatic service: h5",
    );
    expect(() => resolveDevChangePlan(["deploy/nginx/gooes-web-dev.conf"], metadata)).toThrow(
      "unsupported automatic service: dev-nginx",
    );

    const plan = resolveDevChangePlan(["config/runtime.toml"], metadata);
    expect(plan.build_services).toEqual(["api", "admin", "web", "social-video-worker"]);
    expect(plan.deploy_services).toEqual([
      "api",
      "admin",
      "web",
      "social-video-worker",
      "cos-reconcile-worker",
      "billing-reconcile-worker",
    ]);
    expect(plan.classifications).toContain("unknown-runtime");
  });

  test("treats deployment secrets preparation as shared runtime", () => {
    const plan = resolveDevChangePlan(["scripts/prepare-site-content-deployment-secrets.sh"], metadata);

    expect(plan.build_services).toEqual(["api", "admin", "web", "social-video-worker"]);
    expect(plan.deploy_services).toEqual([
      "api",
      "admin",
      "web",
      "social-video-worker",
      "cos-reconcile-worker",
      "billing-reconcile-worker",
    ]);
    expect(plan.classifications).toEqual(["shared-runtime"]);
  });

  test("reads NUL-delimited paths and immutable metadata through the CLI", () => {
    const result = runCli("apps/api/src/app.ts\0apps/web/app/page.tsx\0");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      before_sha: metadata.beforeSha,
      build_services: ["api", "web", "social-video-worker"],
      changed_files: ["apps/api/src/app.ts", "apps/web/app/page.tsx"],
      commit_sha: metadata.commitSha,
      workflow_run_id: metadata.workflowRunId,
    });
  });

  test.each([
    ["missing before SHA", { BEFORE_SHA: undefined }],
    ["missing commit SHA", { COMMIT_SHA: undefined }],
    ["missing run ID", { WORKFLOW_RUN_ID: undefined }],
    ["scientific notation run ID", { WORKFLOW_RUN_ID: "1e3" }],
    ["hexadecimal run ID", { WORKFLOW_RUN_ID: "0x10" }],
    ["leading whitespace in run ID", { WORKFLOW_RUN_ID: " 12345" }],
    ["trailing whitespace in run ID", { WORKFLOW_RUN_ID: "12345 " }],
    ["zero run ID", { WORKFLOW_RUN_ID: "0" }],
    ["unsafe run ID", { WORKFLOW_RUN_ID: "9007199254740992" }],
    ["invalid SHA", { COMMIT_SHA: "g".repeat(40) }],
    ["uppercase SHA", { COMMIT_SHA: "A".repeat(40) }],
    ["short SHA", { COMMIT_SHA: "abc123" }],
  ] as const)("rejects %s", (_name, overrides) => {
    const result = runCli("", overrides);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid immutable build-plan metadata");
  });

  test("does not invoke the CLI when imported", () => {
    const result = spawnSync(
      "node",
      ["--input-type=module", "-e", `await import(${JSON.stringify(scriptUrl.href)})`],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
