import { describe, expect, test } from "bun:test";
import {
  arePendingMigrationsExpected,
  buildSupabaseDryRunArgs,
  collectManualGateEvidenceReferenceIssues,
  hasAllManualGates,
  parsePreflightArgs,
  parseSupabaseDryRunMigrations,
  validateManualGateEvidence,
} from "./workflow-destructive-cleanup-preflight";

describe("parseSupabaseDryRunMigrations", () => {
  test("extracts pending migration filenames from Supabase dry-run output", () => {
    expect(parseSupabaseDryRunMigrations([
      "Would push these migrations:",
      " • 20260612133000_drop_schedule_project_construction_transition.sql",
      " • 20260612143000_drop_legacy_state_machine_objects.sql",
      "Finished supabase db push.",
    ].join("\n"))).toEqual([
      "20260612133000_drop_schedule_project_construction_transition.sql",
      "20260612143000_drop_legacy_state_machine_objects.sql",
    ]);
  });
});

describe("buildSupabaseDryRunArgs", () => {
  test("uses an explicit database url when available", () => {
    expect(buildSupabaseDryRunArgs({
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
      SUPABASE_DB_URL: "postgres://pooled",
    })).toEqual([
      "db",
      "push",
      "--dry-run",
      "--db-url",
      "postgres://direct",
    ]);
  });

  test("falls back to linked project dry-run when no database url exists", () => {
    expect(buildSupabaseDryRunArgs({})).toEqual(["db", "push", "--dry-run"]);
  });
});

describe("arePendingMigrationsExpected", () => {
  test("accepts only the destructive cleanup pair in order", () => {
    expect(arePendingMigrationsExpected([
      "20260612133000_drop_schedule_project_construction_transition.sql",
      "20260612143000_drop_legacy_state_machine_objects.sql",
    ])).toBe(true);

    expect(arePendingMigrationsExpected([
      "20260612143000_drop_legacy_state_machine_objects.sql",
    ])).toBe(false);
  });
});

describe("parsePreflightArgs", () => {
  test("parses manual confirmation flags", () => {
    const options = parsePreflightArgs([
      "--confirm-mini-program",
      "--confirm-admin-smoke",
      "--confirm-backup-window",
      "--evidence-file",
      "docs/state_machine_migrate/audit/manual-gates.json",
    ]);

    expect(hasAllManualGates(options)).toBe(true);
    expect(options.evidenceFile).toBe(
      "docs/state_machine_migrate/audit/manual-gates.json",
    );
  });

  test("rejects unknown flags", () => {
    expect(() => parsePreflightArgs(["--force"])).toThrow("未知参数: --force");
  });
});

describe("validateManualGateEvidence", () => {
  test("accepts complete manual gate evidence", () => {
    expect(validateManualGateEvidence({
      phase_acceptance: {
        phase4_backfill_confirmed: true,
        phase4_reconciliation_evidence:
          "docs/state_machine_migrate/audit/2026-06-12-backfill-report.md",
        phase5_api_smoke_confirmed: true,
        phase5_api_smoke_evidence:
          "docs/state_machine_migrate/audit/2026-06-12-phase5-verification.md",
      },
      api_contract: {
        workflow_state_actions_confirmed: true,
        workflow_task_complete_confirmed: true,
        legacy_fields_not_required_confirmed: true,
        evidence:
          "docs/state_machine_migrate/miniprogram-integration.md#验收清单",
      },
      mini_program: {
        confirmed: true,
        confirmed_by: "Orange QA",
        confirmed_at: "2026-06-12T10:00:00+08:00",
        minimum_version: "2.8.0",
        evidence: "https://example.com/orange-release-note",
      },
      admin_smoke: {
        confirmed: true,
        smoke_at: "2026-06-12T11:00:00+08:00",
        actor: "Admin QA",
        evidence: "docs/state_machine_migrate/audit/2026-06-12-phase5-verification.md",
      },
      backup_window: {
        confirmed: true,
        backup_id: "backup-20260612",
        restore_window: "2026-06-12 22:00-23:00 Asia/Shanghai",
        evidence:
          "docs/state_machine_migrate/audit/2026-06-12-destructive-cleanup-report.md#rollback",
      },
    })).toEqual({ ok: true, missing: [], invalid: [] });
  });

  test("reports missing manual gate evidence fields", () => {
    expect(validateManualGateEvidence({
      phase_acceptance: { phase4_backfill_confirmed: true },
      mini_program: { confirmed: true },
      admin_smoke: { confirmed: false },
      backup_window: { confirmed: true, backup_id: "backup-1" },
    })).toEqual({
      ok: false,
      missing: [
        "phase_acceptance.phase4_reconciliation_evidence",
        "phase_acceptance.phase5_api_smoke_confirmed",
        "phase_acceptance.phase5_api_smoke_evidence",
        "api_contract.workflow_state_actions_confirmed",
        "api_contract.workflow_task_complete_confirmed",
        "api_contract.legacy_fields_not_required_confirmed",
        "api_contract.evidence",
        "mini_program.confirmed_by",
        "mini_program.confirmed_at",
        "mini_program.minimum_version",
        "mini_program.evidence",
        "admin_smoke.confirmed",
        "admin_smoke.smoke_at",
        "admin_smoke.actor",
        "admin_smoke.evidence",
        "backup_window.restore_window",
        "backup_window.evidence",
      ],
      invalid: [],
    });
  });

  test("reports missing local evidence file references", () => {
    expect(collectManualGateEvidenceReferenceIssues({
      phase_acceptance: {
        phase4_reconciliation_evidence:
          "docs/state_machine_migrate/audit/missing-backfill.md",
      },
      mini_program: {
        evidence: "https://example.com/release",
      },
    })).toEqual([
      "phase_acceptance.phase4_reconciliation_evidence: missing local evidence path docs/state_machine_migrate/audit/missing-backfill.md",
    ]);
  });
});
