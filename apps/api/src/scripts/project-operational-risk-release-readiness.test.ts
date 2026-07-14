import { describe, expect, test } from "bun:test";

import {
  buildProjectOperationalRiskReleaseReadinessReport,
} from "./project-operational-risk-release-readiness";

describe("project operational risk release readiness", () => {
  test("reports missing local release artifacts before external verification", () => {
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
      () => false,
    );

    expect(report.ok).toBe(false);
    expect(report.status).toBe("missing_artifact");
    expect(report.blockers).toEqual([
      {
        check: "local_artifacts_present",
        detail:
          "missing supabase/migrations/20260714180000_project_operational_risk_rpc.sql, supabase/tests/project_operational_risk_rpc.sql, supabase/tests/project_operational_risk_explain.sql",
        next_action:
          "Restore the project health RPC migration, SQL fixture and EXPLAIN template before release verification.",
      },
    ]);
  });

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
    expect(report.completed_checks).toContain("local_artifacts_present");
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
      "local_artifacts_present",
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
        "local_artifacts_present",
        "migration_list_configured",
        "rpc_performance_smoke_configured",
        "api_smoke_configured",
      ],
      blockers: [],
      read_only_commands: [
        'supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"',
        "cd apps/api && bun --env-file=.env --env-file=.env.local src/scripts/project-operational-risk-performance-smoke.ts",
      ],
    });
  });
});
