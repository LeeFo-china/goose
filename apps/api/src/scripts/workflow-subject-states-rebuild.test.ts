import { describe, expect, test } from "bun:test";
import {
  parseRebuildArgs,
  resolveRebuildDatabaseUrl,
} from "./workflow-subject-states-rebuild";

describe("parseRebuildArgs", () => {
  test("parses apply mode with optional filters", () => {
    expect(parseRebuildArgs([
      "--apply",
      "--tenant-id",
      "tenant-1",
      "--subject-type",
      "project",
    ])).toEqual({
      mode: "apply",
      tenantId: "tenant-1",
      subjectType: "project",
    });
  });

  test("requires exactly one execution mode", () => {
    expect(() => parseRebuildArgs([])).toThrow("请且只请传 --dry-run 或 --apply");
    expect(() => parseRebuildArgs(["--dry-run", "--apply"])).toThrow(
      "请且只请传 --dry-run 或 --apply",
    );
  });

  test("rejects unsupported subject types", () => {
    expect(() => parseRebuildArgs([
      "--dry-run",
      "--subject-type",
      "manual",
    ])).toThrow("--subject-type 必须是 customer、project 或 expense_request");
  });
});

describe("resolveRebuildDatabaseUrl", () => {
  test("uses pooled url before direct url", () => {
    expect(resolveRebuildDatabaseUrl({
      SUPABASE_DB_URL: "postgres://pooled",
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
    })).toBe("postgres://pooled");
  });
});
