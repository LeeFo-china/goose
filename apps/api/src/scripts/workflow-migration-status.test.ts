import { describe, expect, test } from "bun:test";
import { buildWorkflowMigrationStatusReport } from "./workflow-migration-status";

describe("buildWorkflowMigrationStatusReport", () => {
  test("groups passed checks and failed checks with next actions", () => {
    expect(buildWorkflowMigrationStatusReport({
      ok: false,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "cleanup_readiness",
          ok: true,
          detail: "blockers=0",
        },
        {
          name: "manual_gate_evidence",
          ok: false,
          detail: "missing=mini_program.confirmed",
        },
        {
          name: "generated_database_types_clean",
          ok: false,
          detail: "legacy generated type patterns=current_step:",
        },
      ],
    })).toEqual({
      ok: false,
      generated_at: "2026-06-12T00:00:00.000Z",
      completed_checks: ["cleanup_readiness"],
      blockers: [
        {
          phase: "Phase 4/5/External Gates",
          check: "manual_gate_evidence",
          detail: "missing=mini_program.confirmed",
          next_action:
            "Complete manual-gates.json with backfill, smoke, mini-program, admin, and backup evidence.",
        },
        {
          phase: "Phase 6",
          check: "generated_database_types_clean",
          detail: "legacy generated type patterns=current_step:",
          next_action:
            "Regenerate apps/api/src/types/database.ts after destructive apply.",
        },
      ],
    });
  });
});
