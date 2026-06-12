import { describe, expect, test } from "bun:test";
import {
  buildCleanupReadinessReport,
  classifyCleanupReference,
  scanCleanupReferences,
} from "./workflow-cleanup-readiness";

describe("classifyCleanupReference", () => {
  test("treats production source references as blockers", () => {
    expect(classifyCleanupReference({
      path: "apps/api/src/services/customer-status.ts",
      line: 1,
      pattern: "customer_status_transition_logs",
      text: "customer_status_transition_logs",
    })).toEqual({
      kind: "blocker",
      reason: "production source still references legacy state machine",
    });
  });

  test("allows generated types, docs, tests, and historical migrations", () => {
    const paths = [
      "apps/api/src/types/database.ts",
      "apps/api/src/scripts/workflow-cleanup-readiness.test.ts",
      "apps/api/src/scripts/workflow-cleanup-readiness.ts",
      "docs/state_machine_migrate/execution-plan.md",
      "supabase/migrations/20260521143000_create_customer_status_transition_logs.sql",
    ];

    expect(paths.map((path) =>
      classifyCleanupReference({
        path,
        line: 1,
        pattern: "customer_status_transition_logs",
        text: "customer_status_transition_logs",
      }).kind
    )).toEqual(["allowed", "allowed", "allowed", "allowed", "allowed"]);
  });
});

describe("scanCleanupReferences", () => {
  test("finds legacy patterns with line numbers", () => {
    expect(scanCleanupReferences([
      {
        path: "apps/api/src/repositories/projects/legacy/mutations.ts",
        content: [
          "const rpc = 'schedule_project_construction_transition';",
          "const table = 'workflow_tasks';",
        ].join("\n"),
      },
    ])).toEqual([
      {
        path: "apps/api/src/repositories/projects/legacy/mutations.ts",
        line: 1,
        pattern: "schedule_project_construction_transition",
        text: "const rpc = 'schedule_project_construction_transition';",
      },
    ]);
  });
});

describe("buildCleanupReadinessReport", () => {
  test("marks cleanup as not ready when blockers exist", () => {
    const report = buildCleanupReadinessReport([
      {
        path: "apps/api/src/repositories/customer-status-transitions.ts",
        line: 10,
        pattern: "customer_status_transition_logs",
        text: ".from('customer_status_transition_logs')",
      },
      {
        path: "docs/state_machine_migrate/execution-plan.md",
        line: 10,
        pattern: "customer_status_transition_logs",
        text: "customer_status_transition_logs",
      },
    ]);

    expect(report.ready).toBe(false);
    expect(report.blockers).toHaveLength(1);
    expect(report.allowedReferences).toHaveLength(1);
    expect(report.blockers[0]?.path).toBe(
      "apps/api/src/repositories/customer-status-transitions.ts",
    );
  });
});
