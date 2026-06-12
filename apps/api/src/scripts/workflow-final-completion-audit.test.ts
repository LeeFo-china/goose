import { describe, expect, test } from "bun:test";
import {
  buildFinalAuditReport,
  findLegacyGeneratedTypePatterns,
  isBreakingCleanupCommitMessage,
  parseFinalAuditArgs,
  resolveFinalAuditDatabaseUrl,
  summarizeDestructiveCleanupVerifyReport,
} from "./workflow-final-completion-audit";

describe("parseFinalAuditArgs", () => {
  test("parses manual gate evidence file path", () => {
    expect(parseFinalAuditArgs([
      "--evidence-file",
      "docs/state_machine_migrate/audit/manual-gates.json",
    ])).toEqual({
      evidenceFile: "docs/state_machine_migrate/audit/manual-gates.json",
      technicalOnly: false,
    });
  });

  test("parses technical-only mode", () => {
    expect(parseFinalAuditArgs([
      "--technical-only",
      "--evidence-file",
      "docs/state_machine_migrate/audit/manual-gates.json",
    ])).toEqual({
      evidenceFile: "docs/state_machine_migrate/audit/manual-gates.json",
      technicalOnly: true,
    });
  });

  test("rejects unknown flags", () => {
    expect(() => parseFinalAuditArgs(["--force"])).toThrow("未知参数: --force");
  });
});

describe("resolveFinalAuditDatabaseUrl", () => {
  test("prefers direct database url before pooled url", () => {
    expect(resolveFinalAuditDatabaseUrl({
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
      SUPABASE_DB_URL: "postgres://pooled",
    })).toBe("postgres://direct");
  });

  test("returns null when no database url is configured", () => {
    expect(resolveFinalAuditDatabaseUrl({})).toBeNull();
  });
});

describe("buildFinalAuditReport", () => {
  test("passes when all final technical and manual gates pass", () => {
    expect(buildFinalAuditReport({
      databaseUrlConfigured: true,
      databaseUrlDetail: "SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL configured",
      pendingMigrations: [],
      migrationListAligned: true,
      migrationListDetail: "aligned=2",
      cleanupReady: true,
      cleanupBlockerCount: 0,
      destructiveMigrationContentOk: true,
      destructiveMigrationContentDetail: "expected destructive drop targets present",
      destructiveCleanupOk: true,
      destructiveCleanupDetail:
        "legacy objects absent and workflow runtime consistent",
      generatedTypesClean: true,
      generatedTypesDetail: "legacy generated types absent",
      manualGateEvidenceOk: true,
      manualGateEvidenceDetail: "evidence_file=manual-gates.json",
      finalCommitDocumented: true,
      finalCommitDetail:
        "latest_commit=refactor(workflow)!: 删除旧状态机数据库对象",
    }, "2026-06-12T00:00:00.000Z")).toEqual({
      ok: true,
      mode: "final",
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "database_url_configured",
          ok: true,
          detail: "SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL configured",
        },
        { name: "no_pending_migrations", ok: true, detail: "none" },
        { name: "migration_list_aligned", ok: true, detail: "aligned=2" },
        { name: "cleanup_readiness", ok: true, detail: "blockers=0" },
        {
          name: "destructive_migration_content",
          ok: true,
          detail: "expected destructive drop targets present",
        },
        {
          name: "destructive_cleanup_verify",
          ok: true,
          detail: "legacy objects absent and workflow runtime consistent",
        },
        {
          name: "generated_database_types_clean",
          ok: true,
          detail: "legacy generated types absent",
        },
        {
          name: "manual_gate_evidence",
          ok: true,
          detail: "evidence_file=manual-gates.json",
        },
        {
          name: "final_breaking_commit_documented",
          ok: true,
          detail: "latest_commit=refactor(workflow)!: 删除旧状态机数据库对象",
        },
      ],
    });
  });

  test("fails when migrations, cleanup, destructive, or manual gates are incomplete", () => {
    expect(buildFinalAuditReport({
      databaseUrlConfigured: false,
      databaseUrlDetail: "missing SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL",
      pendingMigrations: [
        "20260612143000_drop_legacy_state_machine_objects.sql",
      ],
      migrationListAligned: false,
      migrationListDetail: "mismatches=20260612143000->missing",
      cleanupReady: false,
      cleanupBlockerCount: 2,
      destructiveMigrationContentOk: false,
      destructiveMigrationContentDetail:
        "20260612143000_drop_legacy_state_machine_objects.sql: forbidden ALTER TABLE public.customers DROP COLUMN IF EXISTS status",
      destructiveCleanupOk: false,
      destructiveCleanupDetail:
        "legacy_tables_absent: present=customer_status_transition_logs",
      generatedTypesClean: false,
      generatedTypesDetail: "legacy generated type patterns=current_step:",
      manualGateEvidenceOk: false,
      manualGateEvidenceDetail: "missing --evidence-file",
      finalCommitDocumented: false,
      finalCommitDetail:
        "latest commit does not document breaking workflow DB cleanup: feat(workflow): 普通提交",
    }, "2026-06-12T00:00:00.000Z")).toEqual({
      ok: false,
      mode: "final",
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "database_url_configured",
          ok: false,
          detail: "missing SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL",
        },
        {
          name: "no_pending_migrations",
          ok: false,
          detail: "20260612143000_drop_legacy_state_machine_objects.sql",
        },
        {
          name: "migration_list_aligned",
          ok: false,
          detail: "mismatches=20260612143000->missing",
        },
        { name: "cleanup_readiness", ok: false, detail: "blockers=2" },
        {
          name: "destructive_migration_content",
          ok: false,
          detail:
            "20260612143000_drop_legacy_state_machine_objects.sql: forbidden ALTER TABLE public.customers DROP COLUMN IF EXISTS status",
        },
        {
          name: "destructive_cleanup_verify",
          ok: false,
          detail:
            "legacy_tables_absent: present=customer_status_transition_logs",
        },
        {
          name: "generated_database_types_clean",
          ok: false,
          detail: "legacy generated type patterns=current_step:",
        },
        {
          name: "manual_gate_evidence",
          ok: false,
          detail: "missing --evidence-file",
        },
        {
          name: "final_breaking_commit_documented",
          ok: false,
          detail:
            "latest commit does not document breaking workflow DB cleanup: feat(workflow): 普通提交",
        },
      ],
    });
  });

  test("omits final commit gate in technical-only mode", () => {
    const report = buildFinalAuditReport({
      databaseUrlConfigured: true,
      databaseUrlDetail: "SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL configured",
      pendingMigrations: [],
      migrationListAligned: true,
      migrationListDetail: "aligned=2",
      cleanupReady: true,
      cleanupBlockerCount: 0,
      destructiveMigrationContentOk: true,
      destructiveMigrationContentDetail: "expected destructive drop targets present",
      destructiveCleanupOk: true,
      destructiveCleanupDetail:
        "legacy objects absent and workflow runtime consistent",
      generatedTypesClean: true,
      generatedTypesDetail: "legacy generated types absent",
      manualGateEvidenceOk: true,
      manualGateEvidenceDetail: "evidence_file=manual-gates.json",
      finalCommitDocumented: false,
      finalCommitDetail:
        "latest commit does not document breaking workflow DB cleanup",
    }, "2026-06-12T00:00:00.000Z", {
      includeFinalCommitCheck: false,
    });

    expect(report.ok).toBe(true);
    expect(report.mode).toBe("technical_only");
    expect(report.checks.map((check) => check.name)).not.toContain(
      "final_breaking_commit_documented",
    );
  });
});

describe("summarizeDestructiveCleanupVerifyReport", () => {
  test("reports missing database url when no destructive cleanup report exists", () => {
    expect(summarizeDestructiveCleanupVerifyReport(null)).toBe(
      "missing SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL",
    );
  });

  test("summarizes only failed destructive cleanup checks", () => {
    expect(summarizeDestructiveCleanupVerifyReport({
      ok: false,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "legacy_tables_absent",
          ok: false,
          detail: "present=customer_status_transition_logs",
        },
        {
          name: "workflow_runtime_consistency",
          ok: true,
          detail: "total_issues=0",
        },
      ],
    })).toBe(
      "legacy_tables_absent: present=customer_status_transition_logs",
    );
  });

  test("summarizes all checks when destructive cleanup verification passes", () => {
    expect(summarizeDestructiveCleanupVerifyReport({
      ok: true,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "legacy_tables_absent",
          ok: true,
          detail: "absent=customer_status_transition_logs",
        },
        {
          name: "workflow_runtime_consistency",
          ok: true,
          detail: "total_issues=0",
        },
      ],
    })).toBe([
      "legacy_tables_absent: absent=customer_status_transition_logs",
      "workflow_runtime_consistency: total_issues=0",
    ].join("; "));
  });
});

describe("isBreakingCleanupCommitMessage", () => {
  test("accepts breaking workflow database cleanup commit", () => {
    expect(isBreakingCleanupCommitMessage(
      "refactor(workflow)!: 删除旧状态机数据库对象",
    )).toBe(true);
  });

  test("accepts BREAKING CHANGE footer with cleanup context", () => {
    expect(isBreakingCleanupCommitMessage([
      "refactor(workflow): 清理旧状态机数据库对象",
      "",
      "BREAKING CHANGE: 删除旧状态机数据库对象，旧表和旧列不再可用。",
    ].join("\n"))).toBe(true);
  });

  test("rejects non-breaking workflow commits", () => {
    expect(isBreakingCleanupCommitMessage(
      "feat(workflow): 校验人工证据本地路径",
    )).toBe(false);
  });
});

describe("findLegacyGeneratedTypePatterns", () => {
  test("finds old state-machine generated type patterns", () => {
    expect(findLegacyGeneratedTypePatterns([
      "customer_status_transition_logs: {",
      "current_step: string",
      "schedule_project_construction_transition: {",
    ].join("\n"))).toEqual([
      "customer_status_transition_logs",
      "schedule_project_construction_transition",
      "current_step:",
    ]);
  });

  test("passes clean generated type content", () => {
    expect(findLegacyGeneratedTypePatterns([
      "workflow_subject_states: {",
      "workflow_tasks: {",
    ].join("\n"))).toEqual([]);
  });
});
