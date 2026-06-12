import { describe, expect, test } from "bun:test";
import {
  buildFinalAuditReport,
  parseFinalAuditArgs,
  resolveFinalAuditDatabaseUrl,
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
      cleanupReady: true,
      cleanupBlockerCount: 0,
      destructiveCleanupOk: true,
      manualGateEvidenceOk: true,
      manualGateEvidenceDetail: "evidence_file=manual-gates.json",
    }, "2026-06-12T00:00:00.000Z")).toEqual({
      ok: true,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        { name: "no_pending_migrations", ok: true, detail: "none" },
        { name: "cleanup_readiness", ok: true, detail: "blockers=0" },
        {
          name: "destructive_cleanup_verify",
          ok: true,
          detail: "legacy objects absent and workflow runtime consistent",
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
      cleanupReady: false,
      cleanupBlockerCount: 2,
      destructiveCleanupOk: false,
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
        { name: "cleanup_readiness", ok: false, detail: "blockers=2" },
        {
          name: "destructive_cleanup_verify",
          ok: false,
          detail: "legacy objects remain or workflow runtime is inconsistent",
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
