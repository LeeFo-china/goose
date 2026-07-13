import { describe, expect, test } from "bun:test";

import { resolveDevChangePlan } from "../../../scripts/resolve-dev-change-plan.mjs";

const metadata = {
  beforeSha: "1".repeat(40),
  commitSha: "2".repeat(40),
  workflowRunId: 12345,
};

describe("development change plan", () => {
  test.each([
    ["web runtime", ["apps/web/components/official-site/site-footer.tsx"], ["api", "web"], ["api", "web"]],
    [
      "api runtime",
      ["apps/api/src/app.ts"],
      ["api", "social-video-worker"],
      ["api", "social-video-worker", "cos-reconcile-worker"],
    ],
    ["admin runtime", ["apps/admin/app/page.tsx"], ["admin"], ["admin"]],
    [
      "domain runtime",
      ["packages/domain/src/index.ts"],
      ["api", "admin", "web", "social-video-worker"],
      ["api", "admin", "web", "social-video-worker", "cos-reconcile-worker"],
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
    expect(plan.deploy_services).toEqual(["api", "web", "social-video-worker", "cos-reconcile-worker"]);
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
    ]);
    expect(plan.classifications).toEqual(["shared-runtime"]);
  });
});
