import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCommandFailure } from "./workflow-command-failure";
import {
  collectDestructiveMigrationContentIssues,
} from "./workflow-destructive-migration-content";
import {
  arePendingMigrationsExpected,
  collectManualGateEvidenceReferenceIssues,
  loadManualGateEvidence,
  parsePreflightArgs,
  validateManualGateEvidence,
} from "./workflow-destructive-cleanup-preflight";

describe("formatCommandFailure", () => {
  test("uses stderr before stdout or error message", () => {
    const error = Object.assign(new Error("command failed"), {
      stdout: "stdout detail",
      stderr: "stderr detail",
    });

    expect(formatCommandFailure(error)).toBe("stderr detail");
  });

  test("falls back to stdout and then message", () => {
    expect(formatCommandFailure(Object.assign(new Error("command failed"), {
      stdout: "stdout detail",
      stderr: "",
    }))).toBe("stdout detail");

    expect(formatCommandFailure(new Error("command failed"))).toBe(
      "command failed",
    );
  });

  test("normalizes and truncates long command output", () => {
    const error = Object.assign(new Error("command failed"), {
      stderr: `${"a".repeat(520)}\n${"b".repeat(20)}`,
    });

    const detail = formatCommandFailure(error);
    expect(detail).toHaveLength(503);
    expect(detail.endsWith("...")).toBe(true);
    expect(detail).not.toContain("\n");
  });

  test("prefers the real error line over bundled source excerpts", () => {
    const error = Object.assign(new Error("command failed"), {
      stderr: [
        '165 | ${Qh(D.cause," ")}',
        "166 | }`:D.stack).join(`",
        "SyntaxError: JSON Parse error: Unable to parse JSON string",
        "      at ~effect/Effect/successCont (/$bunfs/root/supabase:170:7794)",
      ].join("\n"),
    });

    expect(formatCommandFailure(error)).toBe(
      "SyntaxError: JSON Parse error: Unable to parse JSON string",
    );
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

describe("collectDestructiveMigrationContentIssues", () => {
  test("accepts the current destructive migration files", async () => {
    const repoRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
    );

    expect(collectDestructiveMigrationContentIssues({
      "20260612133000_drop_schedule_project_construction_transition.sql":
        await readFile(
          join(
            repoRoot,
            "supabase/migrations/20260612133000_drop_schedule_project_construction_transition.sql",
          ),
          "utf8",
        ),
      "20260612143000_drop_legacy_state_machine_objects.sql": await readFile(
        join(
          repoRoot,
          "supabase/migrations/20260612143000_drop_legacy_state_machine_objects.sql",
        ),
        "utf8",
      ),
    })).toEqual([]);
  });

  test("reports missing destructive drop targets", () => {
    const issues = collectDestructiveMigrationContentIssues({
      "20260612133000_drop_schedule_project_construction_transition.sql": "",
      "20260612143000_drop_legacy_state_machine_objects.sql":
        "DROP TABLE IF EXISTS public.customer_status_transition_logs;",
    });

    expect(issues).toContain(
      "20260612133000_drop_schedule_project_construction_transition.sql: missing migration file",
    );
    expect(issues).toContain(
      "20260612143000_drop_legacy_state_machine_objects.sql: missing DROP FUNCTION IF EXISTS public.schedule_project_construction_transition",
    );
  });

  test("rejects destructive drops for retained business status columns", () => {
    const issues = collectDestructiveMigrationContentIssues({
      "20260612133000_drop_schedule_project_construction_transition.sql":
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition;",
      "20260612143000_drop_legacy_state_machine_objects.sql": [
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition",
        "DROP INDEX IF EXISTS public.idx_expense_requests_current_step",
        "DROP INDEX IF EXISTS public.customer_status_transition_logs_customer_created_idx",
        "DROP INDEX IF EXISTS public.customer_status_transition_logs_tenant_created_idx",
        "DROP INDEX IF EXISTS public.customer_status_transition_logs_action_idx",
        "DROP INDEX IF EXISTS public.project_status_transition_logs_project_created_idx",
        "DROP INDEX IF EXISTS public.project_status_transition_logs_tenant_created_idx",
        "DROP INDEX IF EXISTS public.project_status_transition_logs_action_idx",
        "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_request_id",
        "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_assignee_status",
        "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_step_status",
        "DROP INDEX IF EXISTS public.expense_request_approval_chains_tenant_assignee_status_idx",
        "DROP TABLE IF EXISTS public.customer_status_transition_logs",
        "DROP TABLE IF EXISTS public.project_status_transition_logs",
        "DROP TABLE IF EXISTS public.expense_request_approval_chains",
        'DROP POLICY IF EXISTS "Approvers view pending" ON public.expense_requests',
        "DROP CONSTRAINT IF EXISTS expense_requests_current_step_check",
        "DROP COLUMN IF EXISTS current_step",
        "DROP COLUMN IF EXISTS current_step_role",
        "ALTER TABLE public.customers DROP COLUMN IF EXISTS status",
      ].join(";\n"),
    });

    expect(issues).toContain(
      "20260612143000_drop_legacy_state_machine_objects.sql: forbidden ALTER TABLE public.customers DROP COLUMN IF EXISTS status",
    );
  });

  test("rejects multiline destructive drops for retained business status columns", () => {
    const issues = collectDestructiveMigrationContentIssues({
      "20260612133000_drop_schedule_project_construction_transition.sql":
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition;",
      "20260612143000_drop_legacy_state_machine_objects.sql": [
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition",
        "DROP INDEX IF EXISTS public.idx_expense_requests_current_step",
        "DROP INDEX IF EXISTS public.customer_status_transition_logs_customer_created_idx",
        "DROP INDEX IF EXISTS public.customer_status_transition_logs_tenant_created_idx",
        "DROP INDEX IF EXISTS public.customer_status_transition_logs_action_idx",
        "DROP INDEX IF EXISTS public.project_status_transition_logs_project_created_idx",
        "DROP INDEX IF EXISTS public.project_status_transition_logs_tenant_created_idx",
        "DROP INDEX IF EXISTS public.project_status_transition_logs_action_idx",
        "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_request_id",
        "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_assignee_status",
        "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_step_status",
        "DROP INDEX IF EXISTS public.expense_request_approval_chains_tenant_assignee_status_idx",
        "DROP TABLE IF EXISTS public.customer_status_transition_logs",
        "DROP TABLE IF EXISTS public.project_status_transition_logs",
        "DROP TABLE IF EXISTS public.expense_request_approval_chains",
        'DROP POLICY IF EXISTS "Approvers view pending" ON public.expense_requests',
        "DROP CONSTRAINT IF EXISTS expense_requests_current_step_check",
        "DROP COLUMN IF EXISTS current_step",
        "DROP COLUMN IF EXISTS current_step_role",
        "ALTER TABLE public.projects\n  DROP COLUMN IF EXISTS status",
      ].join(";\n"),
    });

    expect(issues).toContain(
      "20260612143000_drop_legacy_state_machine_objects.sql: forbidden ALTER TABLE public.projects DROP COLUMN IF EXISTS status",
    );
  });
});

describe("parsePreflightArgs", () => {
  test("parses manual gate evidence file path", () => {
    const options = parsePreflightArgs([
      "--evidence-file",
      "docs/state_machine_migrate/audit/manual-gates.json",
    ]);

    expect(options).toEqual({
      evidenceFile: "docs/state_machine_migrate/audit/manual-gates.json",
    });
  });

  test("rejects legacy manual confirmation flags", () => {
    expect(() => parsePreflightArgs(["--confirm-mini-program"]))
      .toThrow("未知参数: --confirm-mini-program");
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

  test("rejects unparseable confirmation timestamps", () => {
    const result = validateManualGateEvidence({
      mini_program: {
        confirmed_at: "after mini-program release",
      },
      admin_smoke: {
        smoke_at: "after admin smoke",
      },
    });

    expect(result.invalid).toEqual([
      "mini_program.confirmed_at: must be a parseable date-time",
      "admin_smoke.smoke_at: must be a parseable date-time",
    ]);
  });

  test("rejects future confirmation timestamps", () => {
    const result = validateManualGateEvidence(
      {
        mini_program: {
          confirmed_at: "2026-06-13T10:00:00+08:00",
        },
        admin_smoke: {
          smoke_at: "2026-06-13T11:00:00+08:00",
        },
      },
      new Date("2026-06-12T12:00:00+08:00"),
    );

    expect(result.invalid).toEqual([
      "mini_program.confirmed_at: must not be in the future",
      "admin_smoke.smoke_at: must not be in the future",
    ]);
  });

  test("rejects non-version mini-program minimum version", () => {
    const result = validateManualGateEvidence({
      mini_program: {
        minimum_version: "already upgraded",
      },
    });

    expect(result.invalid).toEqual([
      "mini_program.minimum_version: must be a version string",
    ]);
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

  test("rejects free-form evidence text without a traceable reference", () => {
    expect(collectManualGateEvidenceReferenceIssues({
      api_contract: {
        evidence: "confirmed in chat",
      },
      admin_smoke: {
        evidence: "docs/state_machine_migrate/audit/2026-06-12-phase5-verification.md#runtime-smoke",
      },
      mini_program: {
        evidence: "https://example.com/orange-release-note",
      },
    })).toEqual([
      "api_contract.evidence: evidence must be an http(s) URL or docs/state_machine_migrate/ path",
    ]);
  });

  test("keeps manual-gates.example.json aligned with required fields", async () => {
    const examplePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
      "docs/state_machine_migrate/audit/manual-gates.example.json",
    );
    const example = JSON.parse(await readFile(examplePath, "utf8"));

    expect(validateManualGateEvidence(example)).toEqual({
      ok: false,
      missing: [
        "phase_acceptance.phase4_backfill_confirmed",
        "phase_acceptance.phase4_reconciliation_evidence",
        "phase_acceptance.phase5_api_smoke_confirmed",
        "phase_acceptance.phase5_api_smoke_evidence",
        "api_contract.workflow_state_actions_confirmed",
        "api_contract.workflow_task_complete_confirmed",
        "api_contract.legacy_fields_not_required_confirmed",
        "api_contract.evidence",
        "mini_program.confirmed",
        "mini_program.confirmed_by",
        "mini_program.confirmed_at",
        "mini_program.minimum_version",
        "mini_program.evidence",
        "admin_smoke.confirmed",
        "admin_smoke.smoke_at",
        "admin_smoke.actor",
        "admin_smoke.evidence",
        "backup_window.confirmed",
        "backup_window.backup_id",
        "backup_window.restore_window",
        "backup_window.evidence",
      ],
      invalid: [],
    });
  });
});

describe("loadManualGateEvidence", () => {
  test("reports a missing evidence file as a failed manual gate", async () => {
    expect(await loadManualGateEvidence(
      "docs/state_machine_migrate/audit/missing-manual-gates.json",
    )).toEqual({
      ok: false,
      detail:
        "evidence_file=docs/state_machine_migrate/audit/missing-manual-gates.json; missing evidence file",
    });
  });

  test("reports invalid JSON as a failed manual gate", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gooes-manual-gates-"));
    const path = join(dir, "manual-gates.json");
    try {
      await writeFile(path, "{ invalid", "utf8");
      expect(await loadManualGateEvidence(path)).toEqual({
        ok: false,
        detail: `evidence_file=${path}; invalid JSON`,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports manual gate validation details for invalid evidence files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gooes-manual-gates-"));
    const path = join(dir, "manual-gates.json");
    try {
      await writeFile(
        path,
        JSON.stringify({
          phase_acceptance: {
            phase4_backfill_confirmed: true,
          },
          mini_program: {
            confirmed: true,
            confirmed_by: "Orange QA",
            confirmed_at: "after release",
            minimum_version: "already upgraded",
            evidence: "confirmed in chat",
          },
        }),
        "utf8",
      );

      expect(await loadManualGateEvidence(path)).toEqual({
        ok: false,
        detail: `evidence_file=${path}; ${
          [
            "missing=phase_acceptance.phase4_reconciliation_evidence",
            "missing=phase_acceptance.phase5_api_smoke_confirmed",
            "missing=phase_acceptance.phase5_api_smoke_evidence",
            "missing=api_contract.workflow_state_actions_confirmed",
            "missing=api_contract.workflow_task_complete_confirmed",
            "missing=api_contract.legacy_fields_not_required_confirmed",
            "missing=api_contract.evidence",
            "missing=admin_smoke.confirmed",
            "missing=admin_smoke.smoke_at",
            "missing=admin_smoke.actor",
            "missing=admin_smoke.evidence",
            "missing=backup_window.confirmed",
            "missing=backup_window.backup_id",
            "missing=backup_window.restore_window",
            "missing=backup_window.evidence",
            "invalid=mini_program.evidence: evidence must be an http(s) URL or docs/state_machine_migrate/ path",
            "invalid=mini_program.confirmed_at: must be a parseable date-time",
            "invalid=mini_program.minimum_version: must be a version string",
          ].join(", ")
        }`,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
