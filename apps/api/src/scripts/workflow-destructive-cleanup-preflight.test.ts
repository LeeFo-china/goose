import { describe, expect, test } from "bun:test";
import {
  arePendingMigrationsExpected,
  hasAllManualGates,
  parsePreflightArgs,
  parseSupabaseDryRunMigrations,
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
    ]);

    expect(hasAllManualGates(options)).toBe(true);
  });

  test("rejects unknown flags", () => {
    expect(() => parsePreflightArgs(["--force"])).toThrow("未知参数: --force");
  });
});
