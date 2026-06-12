import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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

  test("finds the legacy expense todo endpoint", () => {
    expect(scanCleanupReferences([
      {
        path: "apps/api/src/controllers/expense-requests/index.ts",
        content: '@Get("/expense-requests/todo")',
      },
    ])).toEqual([
      {
        path: "apps/api/src/controllers/expense-requests/index.ts",
        line: 1,
        pattern: "expense-requests/todo",
        text: '@Get("/expense-requests/todo")',
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

describe("customer status transition log cleanup", () => {
  test("customer status services no longer depend on legacy transition logs", () => {
    const legacyRepositoryPath = "src/repositories/customer-status-transitions.ts";
    const sourcePaths = [
      legacyRepositoryPath,
      "src/services/customer-status.ts",
      "src/services/project-status.ts",
    ];
    const existingSources = sourcePaths
      .filter((path) => existsSync(path))
      .map((path) => ({
        path: `apps/api/${path}`,
        content: readFileSync(path, "utf8"),
      }));

    const references = scanCleanupReferences(existingSources).filter((reference) =>
      reference.path.includes("customer-status") ||
      reference.text.includes("customerStatusTransitionRepository")
    );

    expect(existsSync(legacyRepositoryPath)).toBe(false);
    expect(references).toEqual([]);
  });
});

describe("project status transition log cleanup", () => {
  test("project status services no longer depend on legacy transition logs", () => {
    const legacyRepositoryPath = "src/repositories/project-status-transitions.ts";
    const sourcePaths = [
      legacyRepositoryPath,
      "src/services/project-status.ts",
    ];
    const existingSources = sourcePaths
      .filter((path) => existsSync(path))
      .map((path) => ({
        path: `apps/api/${path}`,
        content: readFileSync(path, "utf8"),
      }));

    const references = scanCleanupReferences(existingSources).filter((reference) =>
      reference.path.includes("project-status") ||
      reference.text.includes("projectStatusTransitionRepository")
    );

    expect(existsSync(legacyRepositoryPath)).toBe(false);
    expect(references).toEqual([]);
  });
});

describe("project construction scheduling cleanup", () => {
  test("project repository no longer calls legacy schedule construction RPC", () => {
    const sourcePath = "src/repositories/projects/legacy/mutations.ts";
    const references = scanCleanupReferences([
      {
        path: `apps/api/${sourcePath}`,
        content: readFileSync(sourcePath, "utf8"),
      },
    ]).filter((reference) =>
      reference.pattern === "schedule_project_construction_transition"
    );

    expect(references).toEqual([]);
  });
});
