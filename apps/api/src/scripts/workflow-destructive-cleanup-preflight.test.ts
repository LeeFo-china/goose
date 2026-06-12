import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatCommandFailure } from "./workflow-command-failure";
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
});
