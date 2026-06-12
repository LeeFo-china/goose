import { describe, expect, test } from "bun:test";
import {
  buildFinalAuditReport,
  findLegacyGeneratedTypePatterns,
  parseFinalAuditArgs,
  parseSupabaseMigrationListRows,
  resolveFinalAuditDatabaseUrl,
  summarizeMigrationListAlignment,
} from "./workflow-final-completion-audit";

describe("parseFinalAuditArgs", () => {
  test("parses manual gate evidence file path", () => {
    expect(parseFinalAuditArgs([
      "--evidence-file",
      "docs/state_machine_migrate/audit/manual-gates.json",
    ])).toEqual({
      evidenceFile: "docs/state_machine_migrate/audit/manual-gates.json",
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
      pendingMigrations: [],
      migrationListAligned: true,
      migrationListDetail: "aligned=2",
      cleanupReady: true,
      cleanupBlockerCount: 0,
      destructiveCleanupOk: true,
      generatedTypesClean: true,
      generatedTypesDetail: "legacy generated types absent",
      manualGateEvidenceOk: true,
      manualGateEvidenceDetail: "evidence_file=manual-gates.json",
    }, "2026-06-12T00:00:00.000Z")).toEqual({
      ok: true,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        { name: "no_pending_migrations", ok: true, detail: "none" },
        { name: "migration_list_aligned", ok: true, detail: "aligned=2" },
        { name: "cleanup_readiness", ok: true, detail: "blockers=0" },
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
      ],
    });
  });

  test("fails when migrations, cleanup, destructive, or manual gates are incomplete", () => {
    expect(buildFinalAuditReport({
      pendingMigrations: [
        "20260612143000_drop_legacy_state_machine_objects.sql",
      ],
      migrationListAligned: false,
      migrationListDetail: "mismatches=20260612143000->missing",
      cleanupReady: false,
      cleanupBlockerCount: 2,
      destructiveCleanupOk: false,
      generatedTypesClean: false,
      generatedTypesDetail: "legacy generated type patterns=current_step:",
      manualGateEvidenceOk: false,
      manualGateEvidenceDetail: "missing --evidence-file",
    }, "2026-06-12T00:00:00.000Z")).toEqual({
      ok: false,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
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
          name: "destructive_cleanup_verify",
          ok: false,
          detail: "legacy objects remain or workflow runtime is inconsistent",
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
      ],
    });
  });
});

describe("parseSupabaseMigrationListRows", () => {
  test("parses local and remote migration versions from table output", () => {
    const rows = parseSupabaseMigrationListRows([
      "   Local          | Remote         | Time (UTC)",
      "  ----------------|----------------|---------------------",
      "   20260612124500 | 20260612124500 | 2026-06-12 12:45:00",
      "   20260612143000 |                | 2026-06-12 14:30:00",
    ].join("\n"));

    expect(rows).toEqual([
      { local: "20260612124500", remote: "20260612124500" },
      { local: "20260612143000", remote: null },
    ]);
  });
});

describe("summarizeMigrationListAlignment", () => {
  test("passes when all local and remote versions match", () => {
    expect(summarizeMigrationListAlignment([
      { local: "20260612124500", remote: "20260612124500" },
      { local: "20260612143000", remote: "20260612143000" },
    ])).toEqual({ ok: true, detail: "aligned=2" });
  });

  test("fails when any local or remote version is missing", () => {
    expect(summarizeMigrationListAlignment([
      { local: "20260612124500", remote: "20260612124500" },
      { local: "20260612143000", remote: null },
    ])).toEqual({
      ok: false,
      detail: "mismatches=20260612143000->missing",
    });
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
