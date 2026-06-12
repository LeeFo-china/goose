import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildManualGateCheckReport,
  parseManualGateCheckArgs,
} from "./workflow-manual-gates-check";

describe("parseManualGateCheckArgs", () => {
  test("parses manual gate evidence file path", () => {
    expect(parseManualGateCheckArgs([
      "--evidence-file",
      "docs/state_machine_migrate/audit/manual-gates.json",
    ])).toEqual({
      evidenceFile: "docs/state_machine_migrate/audit/manual-gates.json",
    });
  });

  test("rejects unknown flags", () => {
    expect(() => parseManualGateCheckArgs(["--force"]))
      .toThrow("未知参数: --force");
  });
});

describe("buildManualGateCheckReport", () => {
  test("fails when evidence file is not provided", async () => {
    expect(await buildManualGateCheckReport(
      null,
      "2026-06-12T00:00:00.000Z",
    )).toEqual({
      ok: false,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "manual_gate_evidence",
          ok: false,
          detail: "missing --evidence-file",
        },
      ],
    });
  });

  test("reports missing evidence file", async () => {
    expect(await buildManualGateCheckReport(
      "docs/state_machine_migrate/audit/missing-manual-gates.json",
      "2026-06-12T00:00:00.000Z",
    )).toEqual({
      ok: false,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "manual_gate_evidence",
          ok: false,
          detail:
            "evidence_file=docs/state_machine_migrate/audit/missing-manual-gates.json; missing evidence file",
        },
      ],
    });
  });

  test("passes complete manual gate evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gooes-manual-gates-check-"));
    const path = join(dir, "manual-gates.json");
    try {
      await writeFile(
        path,
        JSON.stringify({
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
            evidence:
              "docs/state_machine_migrate/audit/2026-06-12-phase5-verification.md",
          },
          backup_window: {
            confirmed: true,
            backup_id: "backup-20260612",
            restore_window: "2026-06-12 22:00-23:00 Asia/Shanghai",
            evidence:
              "docs/state_machine_migrate/audit/2026-06-12-destructive-cleanup-report.md#rollback",
          },
        }),
        "utf8",
      );

      expect(await buildManualGateCheckReport(
        path,
        "2026-06-12T00:00:00.000Z",
      )).toEqual({
        ok: true,
        generated_at: "2026-06-12T00:00:00.000Z",
        checks: [
          {
            name: "manual_gate_evidence",
            ok: true,
            detail: `evidence_file=${path}`,
          },
        ],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
