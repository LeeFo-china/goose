import { describe, expect, test } from "bun:test";
import { buildWorkflowMigrationStatusReport } from "./workflow-migration-status";

describe("buildWorkflowMigrationStatusReport", () => {
  test("groups passed checks and failed checks with next actions", () => {
    expect(buildWorkflowMigrationStatusReport({
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
          name: "cleanup_readiness",
          ok: true,
          detail: "blockers=0",
        },
        {
          name: "destructive_migration_content",
          ok: false,
          detail: "forbidden ALTER TABLE public.customers DROP COLUMN IF EXISTS status",
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
        {
          name: "migration_list_aligned",
          ok: false,
          detail: "mismatches=20260612143000->missing",
        },
      ],
    })).toEqual({
      ok: false,
      mode: "final",
      generated_at: "2026-06-12T00:00:00.000Z",
      completed_checks: ["cleanup_readiness"],
      blockers: [
        {
          phase: "Phase 6",
          check: "database_url_configured",
          detail: "missing SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL",
          next_action:
            "Configure SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL for the explicit destructive cleanup target.",
        },
        {
          phase: "Phase 6",
          check: "destructive_migration_content",
          detail:
            "forbidden ALTER TABLE public.customers DROP COLUMN IF EXISTS status",
          next_action:
            "Keep the destructive cleanup migration pair limited to approved old state-machine object drops.",
        },
        {
          phase: "Phase 4/5/External Gates",
          check: "manual_gate_evidence",
          detail: "missing=mini_program.confirmed",
          next_action:
            "Complete manual-gates.json, then run workflow:manual-gates-check before destructive preflight.",
        },
        {
          phase: "Phase 6",
          check: "generated_database_types_clean",
          detail: "legacy generated type patterns=current_step:",
          next_action:
            "Regenerate apps/api/src/types/database.ts after destructive apply.",
        },
        {
          phase: "Phase 6",
          check: "migration_list_aligned",
          detail: "mismatches=20260612143000->missing",
          next_action:
            "Use workflow:migration-status or workflow:final-completion-audit to verify local and remote migration history alignment after target apply.",
        },
      ],
    });
  });

  test("summarizes technical-only audit without final commit blocker", () => {
    expect(buildWorkflowMigrationStatusReport({
      ok: true,
      mode: "technical_only",
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "database_url_configured",
          ok: true,
          detail: "SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL configured",
        },
        {
          name: "no_pending_migrations",
          ok: true,
          detail: "none",
        },
        {
          name: "manual_gate_evidence",
          ok: true,
          detail: "evidence_file=manual-gates.json",
        },
      ],
    })).toEqual({
      ok: true,
      mode: "technical_only",
      generated_at: "2026-06-12T00:00:00.000Z",
      completed_checks: [
        "database_url_configured",
        "no_pending_migrations",
        "manual_gate_evidence",
      ],
      blockers: [],
    });
  });
});
