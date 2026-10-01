import { describe, expect, test } from "bun:test";
import {
  buildBackfillRunResult,
  resolveBackfillSubjectTypes,
} from "./runner";
import {
  renderBackfillReport,
  summarizeResultsByLegacyStatus,
} from "./report";
import type { BackfillResult } from "./types";

const results: BackfillResult[] = [
  {
    subject_type: "customer",
    subject_id: "customer-1",
    legacy_status: "potential",
    legacy_step: null,
    workflow_key: "customer_main",
    node_key: "potential",
    action: "dry_run_create",
    reason: "",
    instance_id: "",
    task_created: true,
  },
  {
    subject_type: "customer",
    subject_id: "customer-2",
    legacy_status: "following",
    legacy_step: null,
    workflow_key: "customer_main",
    node_key: "following",
    action: "skip",
    reason: "instance_exists",
    instance_id: "instance-2",
    task_created: false,
  },
];

describe("resolveBackfillSubjectTypes", () => {
  test("returns only the requested subject type when filter is provided", () => {
    expect(resolveBackfillSubjectTypes({
      subjectType: "customer",
    })).toEqual(["customer"]);
  });

  test("returns all subject types when no filter is provided", () => {
    expect(resolveBackfillSubjectTypes({})).toEqual([
      "customer",
      "project",
      "expense_request",
    ]);
  });
});

describe("customer backfill audit output", () => {
  test("returns immutable run metadata and per-status action counts", () => {
    const run = buildBackfillRunResult({
      apply: false,
      generatedAt: "2026-10-01T02:04:05.000Z",
      createdBefore: "2026-10-01T02:03:04.000Z",
      results,
      outputPath: "/tmp/customer-workflow-audit.md",
    });

    expect(run).toEqual({
      apply: false,
      generatedAt: "2026-10-01T02:04:05.000Z",
      createdBefore: "2026-10-01T02:03:04.000Z",
      scanned: 2,
      summary: {
        "customer.dry_run_create": 1,
        "customer.skip.instance_exists": 1,
      },
      statusSummary: {
        "customer.following.skip": 1,
        "customer.potential.dry_run_create": 1,
      },
      outputPath: "/tmp/customer-workflow-audit.md",
    });
  });

  test("renders only dry-run create candidates in planned rows", () => {
    expect(summarizeResultsByLegacyStatus(results)).toEqual({
      "customer.following.skip": 1,
      "customer.potential.dry_run_create": 1,
    });

    const markdown = renderBackfillReport({
      tenantId: "tenant-1",
      apply: false,
      generatedAt: "2026-10-01T02:04:05.000Z",
      createdBefore: "2026-10-01T02:03:04.000Z",
      results,
    });

    expect(markdown).toContain("- generated_at: 2026-10-01T02:04:05.000Z");
    expect(markdown).toContain("- created_before: 2026-10-01T02:03:04.000Z");
    expect(markdown).toContain("## Planned Rows");
    expect(markdown).toContain("| customer | customer-1 | potential | potential | true |");
    expect(markdown).not.toContain("| customer | customer-2 | following | following | false |");
  });
});
