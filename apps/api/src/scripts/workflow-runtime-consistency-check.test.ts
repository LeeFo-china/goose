import { describe, expect, test } from "bun:test";
import {
  buildWorkflowRuntimeConsistencyReport,
  resolveWorkflowRuntimeConsistencyDatabaseUrl,
} from "./workflow-runtime-consistency-check";

describe("resolveWorkflowRuntimeConsistencyDatabaseUrl", () => {
  test("prefers SUPABASE_DB_URL and falls back to direct url", () => {
    expect(resolveWorkflowRuntimeConsistencyDatabaseUrl({
      SUPABASE_DB_URL: "postgres://pooled",
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
    })).toBe("postgres://pooled");

    expect(resolveWorkflowRuntimeConsistencyDatabaseUrl({
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
    })).toBe("postgres://direct");
  });

  test("returns null when no database url is configured", () => {
    expect(resolveWorkflowRuntimeConsistencyDatabaseUrl({})).toBeNull();
  });
});

describe("buildWorkflowRuntimeConsistencyReport", () => {
  test("marks the report ok when all checks have zero issues", () => {
    expect(buildWorkflowRuntimeConsistencyReport([
      { check_name: "running_instance_missing_subject_state", issue_count: 0 },
      { check_name: "pending_task_node_not_current", issue_count: 0 },
    ], "2026-06-12T00:00:00.000Z")).toEqual({
      generated_at: "2026-06-12T00:00:00.000Z",
      ok: true,
      total_issues: 0,
      checks: [
        { check_name: "running_instance_missing_subject_state", issue_count: 0 },
        { check_name: "pending_task_node_not_current", issue_count: 0 },
      ],
    });
  });

  test("sums issue counts and marks inconsistent reports as not ok", () => {
    expect(buildWorkflowRuntimeConsistencyReport([
      { check_name: "running_instance_missing_subject_state", issue_count: 2 },
      { check_name: "pending_task_node_not_current", issue_count: 3 },
    ], "2026-06-12T00:00:00.000Z")).toEqual({
      generated_at: "2026-06-12T00:00:00.000Z",
      ok: false,
      total_issues: 5,
      checks: [
        { check_name: "running_instance_missing_subject_state", issue_count: 2 },
        { check_name: "pending_task_node_not_current", issue_count: 3 },
      ],
    });
  });
});
