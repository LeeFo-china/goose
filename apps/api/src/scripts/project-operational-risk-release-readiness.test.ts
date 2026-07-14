import { describe, expect, test } from "bun:test";

import {
  buildProjectOperationalRiskReleaseReadinessReport,
} from "./project-operational-risk-release-readiness";

describe("project operational risk release readiness", () => {
  test("reports missing release prerequisites without exposing secret values", () => {
    const report = buildProjectOperationalRiskReleaseReadinessReport(
      {
        SUPABASE_DB_DIRECT_URL: "postgres://secret-user:secret-pass@db.example/postgres",
        PROJECT_HEALTH_TENANT_ID: "",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      },
      "2026-07-15T08:00:00.000Z",
    );

    expect(report.ok).toBe(false);
    expect(report.status).toBe("missing_env");
    expect(report.blockers.map((item) => item.check)).toEqual([
      "rpc_performance_smoke_configured",
      "api_smoke_configured",
    ]);
    expect(JSON.stringify(report)).not.toContain("secret-pass");
    expect(JSON.stringify(report)).not.toContain("service-role-secret");
  });

  test("requires dev API URL and admin token for full release readiness", () => {
    const report = buildProjectOperationalRiskReleaseReadinessReport(
      {
        SUPABASE_DB_DIRECT_URL: "postgres://db",
        PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      },
      "2026-07-15T08:00:00.000Z",
    );

    expect(report.ok).toBe(false);
    expect(report.status).toBe("api_smoke_skipped");
    expect(report.completed_checks).toEqual([
      "migration_list_configured",
      "rpc_performance_smoke_configured",
    ]);
    expect(report.blockers).toEqual([
      {
        check: "api_smoke_configured",
        detail: "missing PROJECT_HEALTH_API_URL, PROJECT_HEALTH_ADMIN_TOKEN",
        next_action:
          "Configure PROJECT_HEALTH_API_URL and PROJECT_HEALTH_ADMIN_TOKEN, then run the dev API smoke before release.",
      },
    ]);
  });

  test("returns ready status and read-only verification commands when all prerequisites exist", () => {
    const report = buildProjectOperationalRiskReleaseReadinessReport(
      {
        SUPABASE_DB_DIRECT_URL: "postgres://db",
        PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        PROJECT_HEALTH_API_URL: "https://api-dev.goodcms.cn",
        PROJECT_HEALTH_ADMIN_TOKEN: "admin-token",
      },
      "2026-07-15T08:00:00.000Z",
    );

    expect(report).toEqual({
      ok: true,
      status: "ready",
      generated_at: "2026-07-15T08:00:00.000Z",
      completed_checks: [
        "migration_list_configured",
        "rpc_performance_smoke_configured",
        "api_smoke_configured",
      ],
      blockers: [],
      read_only_commands: [
        'supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"',
        "cd apps/api && PROJECT_HEALTH_TENANT_ID=\"$PROJECT_HEALTH_TENANT_ID\" bun --env-file=.env src/scripts/project-operational-risk-performance-smoke.ts",
        "cd apps/api && PROJECT_HEALTH_TENANT_ID=\"$PROJECT_HEALTH_TENANT_ID\" PROJECT_HEALTH_API_URL=\"$PROJECT_HEALTH_API_URL\" PROJECT_HEALTH_ADMIN_TOKEN=\"$PROJECT_HEALTH_ADMIN_TOKEN\" bun --env-file=.env src/scripts/project-operational-risk-performance-smoke.ts",
      ],
    });
  });
});
