import { describe, expect, test } from "bun:test";

import {
  buildProjectOperationalRiskReleaseReadinessReport,
} from "./project-operational-risk-release-readiness";

const READY_UI_AUDIT_EVIDENCE = `<!-- project-health-ui-release-evidence
{
  "status": "ready",
  "impeccable_score": 16,
  "p0_count": 0,
  "p1_count": 0,
  "real_dev_screenshots": true,
  "wcag_aa_smoke": true
}
-->`;

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
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_E2E_TENANT_ADMIN_PHONE: "18800000001",
      },
      "2026-07-15T08:00:00.000Z",
      () => false,
      () => READY_UI_AUDIT_EVIDENCE,
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
      undefined,
      () => READY_UI_AUDIT_EVIDENCE,
    );

    expect(report.ok).toBe(false);
    expect(report.status).toBe("missing_env");
    expect(report.completed_checks).toContain("local_artifacts_present");
    expect(report.blockers.map((item) => item.check)).toEqual([
      "rpc_performance_smoke_configured",
      "api_smoke_configured",
      "admin_smoke_configured",
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
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_E2E_TENANT_ADMIN_PHONE: "18800000001",
      },
      "2026-07-15T08:00:00.000Z",
      undefined,
      () => READY_UI_AUDIT_EVIDENCE,
    );

    expect(report.ok).toBe(false);
    expect(report.status).toBe("api_smoke_skipped");
    expect(report.completed_checks).toEqual([
      "local_artifacts_present",
      "migration_list_configured",
      "rpc_performance_smoke_configured",
      "admin_smoke_configured",
      "ui_audit_recorded",
    ]);
    expect(report.blockers).toEqual([
      {
        check: "api_smoke_configured",
        detail:
          "missing PROJECT_HEALTH_API_URL or GOOES_API_BASE_URL, PROJECT_HEALTH_ADMIN_TOKEN or ADMIN_TOKEN",
        next_action:
          "Configure PROJECT_HEALTH_API_URL or GOOES_API_BASE_URL and PROJECT_HEALTH_ADMIN_TOKEN or ADMIN_TOKEN, then run the dev API smoke before release.",
      },
    ]);
  });

  test("accepts GOOES_API_BASE_URL as the dev API smoke URL alias", () => {
    const report = buildProjectOperationalRiskReleaseReadinessReport(
      {
        SUPABASE_DB_DIRECT_URL: "postgres://db",
        PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        GOOES_API_BASE_URL: "https://api-dev.goodcms.cn",
        PROJECT_HEALTH_ADMIN_TOKEN: "admin-token",
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_E2E_TENANT_ADMIN_PHONE: "18800000001",
      },
      "2026-07-15T08:00:00.000Z",
      undefined,
      () => READY_UI_AUDIT_EVIDENCE,
    );

    expect(report.ok).toBe(true);
    expect(report.completed_checks).toContain("api_smoke_configured");
  });

  test("accepts ADMIN_TOKEN as the dev API smoke token alias", () => {
    const report = buildProjectOperationalRiskReleaseReadinessReport(
      {
        SUPABASE_DB_DIRECT_URL: "postgres://db",
        PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        PROJECT_HEALTH_API_URL: "https://api-dev.goodcms.cn",
        ADMIN_TOKEN: "admin-token",
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_E2E_TENANT_ADMIN_PHONE: "18800000001",
      },
      "2026-07-15T08:00:00.000Z",
      undefined,
      () => READY_UI_AUDIT_EVIDENCE,
    );

    expect(report.ok).toBe(true);
    expect(report.completed_checks).toContain("api_smoke_configured");
  });

  test("requires admin base URL and tenant admin phone for release browser smoke", () => {
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
      undefined,
      () => READY_UI_AUDIT_EVIDENCE,
    );

    expect(report.ok).toBe(false);
    expect(report.status).toBe("admin_smoke_skipped");
    expect(report.completed_checks).toEqual([
      "local_artifacts_present",
      "migration_list_configured",
      "rpc_performance_smoke_configured",
      "api_smoke_configured",
      "ui_audit_recorded",
    ]);
    expect(report.blockers).toEqual([
      {
        check: "admin_smoke_configured",
        detail: "missing PLAYWRIGHT_BASE_URL, GOOES_E2E_TENANT_ADMIN_PHONE",
        next_action:
          "Configure PLAYWRIGHT_BASE_URL and GOOES_E2E_TENANT_ADMIN_PHONE, then run the dev Admin project health browser smoke before release.",
      },
    ]);
  });

  test("requires structured UI audit evidence before release readiness", () => {
    const report = buildProjectOperationalRiskReleaseReadinessReport(
      {
        SUPABASE_DB_DIRECT_URL: "postgres://db",
        PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        PROJECT_HEALTH_API_URL: "https://api-dev.goodcms.cn",
        PROJECT_HEALTH_ADMIN_TOKEN: "admin-token",
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_E2E_TENANT_ADMIN_PHONE: "18800000001",
      },
      "2026-07-15T08:00:00.000Z",
      undefined,
      () => `# 项目运营风险中心 UI 审核记录

尚未执行基于真实截图的 $impeccable audit 评分。`,
    );

    expect(report.ok).toBe(false);
    expect(report.status).toBe("ui_audit_pending");
    expect(report.completed_checks).toEqual([
      "local_artifacts_present",
      "migration_list_configured",
      "rpc_performance_smoke_configured",
      "api_smoke_configured",
      "admin_smoke_configured",
    ]);
    expect(report.blockers).toEqual([
      {
        check: "ui_audit_recorded",
        detail:
          "missing project-health-ui-release-evidence block in docs/audit/2026-07-14-project-operational-risk-ui-audit.md",
        next_action:
          "Record real dev screenshots, WCAG AA smoke and Impeccable score evidence before release.",
      },
    ]);
  });

  test("blocks UI audit evidence below the Impeccable release threshold", () => {
    const report = buildProjectOperationalRiskReleaseReadinessReport(
      {
        SUPABASE_DB_DIRECT_URL: "postgres://db",
        PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        SUPABASE_URL: "https://supabase.example",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        PROJECT_HEALTH_API_URL: "https://api-dev.goodcms.cn",
        PROJECT_HEALTH_ADMIN_TOKEN: "admin-token",
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_E2E_TENANT_ADMIN_PHONE: "18800000001",
      },
      "2026-07-15T08:00:00.000Z",
      undefined,
      () => `<!-- project-health-ui-release-evidence
{"status":"ready","impeccable_score":15,"p0_count":0,"p1_count":0,"real_dev_screenshots":true,"wcag_aa_smoke":true}
-->`,
    );

    expect(report.ok).toBe(false);
    expect(report.status).toBe("ui_audit_pending");
    expect(report.blockers).toEqual([
      {
        check: "ui_audit_recorded",
        detail: "impeccable_score must be >= 16",
        next_action:
          "Record real dev screenshots, WCAG AA smoke and Impeccable score evidence before release.",
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
        PLAYWRIGHT_BASE_URL: "https://admin-dev.goodcms.cn",
        GOOES_E2E_TENANT_ADMIN_PHONE: "18800000001",
      },
      "2026-07-15T08:00:00.000Z",
      undefined,
      () => READY_UI_AUDIT_EVIDENCE,
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
        "admin_smoke_configured",
        "ui_audit_recorded",
      ],
      blockers: [],
      read_only_commands: [
        'supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"',
        "cd apps/api && bun --env-file=.env --env-file=.env.local src/scripts/project-operational-risk-performance-smoke.ts",
      ],
    });
  });
});
