import { describe, expect, test } from "bun:test";
import {
  findPendingMigrationFiles,
  parseLocalMigrationFileName,
  summarizeMigrationHistoryAlignment,
  type LocalMigrationEntry,
} from "./workflow-migration-history";

const localMigrations: LocalMigrationEntry[] = [
  {
    version: "20260612124500",
    fileName: "20260612124500_add_cancel_workflow_instance_rpc.sql",
  },
  {
    version: "20260612133000",
    fileName: "20260612133000_drop_schedule_project_construction_transition.sql",
  },
  {
    version: "20260612143000",
    fileName: "20260612143000_drop_legacy_state_machine_objects.sql",
  },
];

describe("parseLocalMigrationFileName", () => {
  test("parses timestamped Supabase migration file names", () => {
    expect(parseLocalMigrationFileName(
      "20260612143000_drop_legacy_state_machine_objects.sql",
    )).toEqual({
      version: "20260612143000",
      fileName: "20260612143000_drop_legacy_state_machine_objects.sql",
    });
  });

  test("ignores non-migration file names", () => {
    expect(parseLocalMigrationFileName("README.md")).toBeNull();
    expect(parseLocalMigrationFileName("20260612_short.sql")).toBeNull();
  });
});

describe("findPendingMigrationFiles", () => {
  test("returns local migrations missing from remote history", () => {
    expect(findPendingMigrationFiles(localMigrations, [
      "20260612124500",
    ])).toEqual([
      "20260612133000_drop_schedule_project_construction_transition.sql",
      "20260612143000_drop_legacy_state_machine_objects.sql",
    ]);
  });
});

describe("summarizeMigrationHistoryAlignment", () => {
  test("passes when local and remote versions match", () => {
    expect(summarizeMigrationHistoryAlignment(localMigrations, [
      "20260612124500",
      "20260612133000",
      "20260612143000",
    ])).toEqual({
      ok: true,
      detail: "aligned=3",
    });
  });

  test("reports local and remote migration mismatches", () => {
    expect(summarizeMigrationHistoryAlignment(localMigrations, [
      "20260612124500",
      "20260613090000",
    ])).toEqual({
      ok: false,
      detail:
        "mismatches=20260612133000->missing, 20260612143000->missing, missing->20260613090000",
    });
  });
});
