import { describe, expect, test } from "bun:test";
import {
  arePendingMigrationsExpected,
  buildSupabaseDryRunArgs,
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
          "docs/state_machine_migrate/audit/staging-backfill.md",
        phase5_api_smoke_confirmed: true,
        phase5_api_smoke_evidence:
          "docs/state_machine_migrate/audit/phase5-smoke.md",
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
        minimum_version: "2.8.0",
        evidence: "Orange release note URL",
      },
      admin_smoke: {
        confirmed: true,
        evidence: "docs/state_machine_migrate/audit/admin-smoke.md",
      },
      backup_window: {
        confirmed: true,
        backup_id: "backup-20260612",
        restore_window: "2026-06-12 22:00-23:00 Asia/Shanghai",
        evidence: "Supabase PITR checkpoint",
      },
    })).toEqual({ ok: true, missing: [] });
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
        "mini_program.minimum_version",
        "mini_program.evidence",
        "admin_smoke.confirmed",
        "admin_smoke.evidence",
        "backup_window.restore_window",
        "backup_window.evidence",
      ],
    });
  });
});
