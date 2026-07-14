import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const SHA = "c".repeat(40);
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabasePublish = process.env.SUPABASE_PUBLISH;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let migrations: typeof import("./migrations");

function completedRun() {
  return {
    id: 555,
    name: "Migrate Production Database",
    display_title: "Production database migration plan",
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: SHA,
    html_url: "https://github.com/acme/repo/actions/runs/555",
    created_at: "2026-07-14T01:00:00Z",
    updated_at: "2026-07-14T01:02:00Z",
    run_started_at: "2026-07-14T01:00:30Z",
    path: ".github/workflows/migrate-production-database.yml",
  };
}

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    workflow_run_id: 555,
    mode: "plan",
    commit_sha: SHA,
    before_count: 120,
    before_latest: "20260711120000",
    after_count: 120,
    after_latest: "20260711120000",
    pending_count: 2,
    pending_versions: ["20260714102000", "20260714113000"],
    applied_count: 0,
    applied_versions: [],
    checked_at: "2026-07-14T01:02:00Z",
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
  process.env.SUPABASE_PUBLISH = process.env.SUPABASE_PUBLISH || "test-publish";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role";
  migrations = await import("./migrations");
});

afterAll(() => {
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabasePublish === undefined) delete process.env.SUPABASE_PUBLISH;
  else process.env.SUPABASE_PUBLISH = originalSupabasePublish;
  if (originalSupabaseServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
});

describe("getProductionMigrationPrecheck", () => {
  test("returns pending migration comparison from the workflow artifact", async () => {
    const gateway = {
      request: mock(async (path: string) => {
        if (path === "/actions/runs/555") return completedRun();
        throw new Error(`unexpected request ${path}`);
      }),
      downloadArtifactJson: mock(async ({ artifactName, fileName }: {
        artifactName: string;
        fileName: string;
      }) => {
        expect(artifactName).toBe("production-migration-precheck");
        expect(fileName).toBe("migration-precheck.json");
        return artifact();
      }),
    };

    const result = await migrations.getProductionMigrationPrecheck.call(
      { githubActionsGateway: gateway },
      "555",
    );

    expect(result).toMatchObject({
      run_id: "555",
      ready: true,
      needs_migration: true,
      pending_count: 2,
      pending_versions: ["20260714102000", "20260714113000"],
      before_latest: "20260711120000",
      run_url: "https://github.com/acme/repo/actions/runs/555",
    });
  });

  test("reports a completed no-op plan as no migration needed", async () => {
    const gateway = {
      request: mock(async () => completedRun()),
      downloadArtifactJson: mock(async () => artifact({
        pending_count: 0,
        pending_versions: [],
      })),
    };

    const result = await migrations.getProductionMigrationPrecheck.call(
      { githubActionsGateway: gateway },
      "555",
    );

    expect(result.ready).toBe(true);
    expect(result.needs_migration).toBe(false);
    expect(result.message).toContain("无需迁移");
  });
});
