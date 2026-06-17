import { describe, expect, test } from "bun:test";
import {
  buildDecorationWorkflowBusinessAuditReport,
  parseDecorationWorkflowBusinessAuditArgs,
  resolveDecorationWorkflowBusinessAuditDatabaseUrl,
} from "./decoration-workflow-business-audit";

describe("parseDecorationWorkflowBusinessAuditArgs", () => {
  test("parses sample limit and strict mode", () => {
    expect(parseDecorationWorkflowBusinessAuditArgs([
      "--sample-limit",
      "25",
      "--strict",
    ])).toEqual({
      sampleLimit: 25,
      strict: true,
    });
  });

  test("rejects invalid sample limit", () => {
    expect(() =>
      parseDecorationWorkflowBusinessAuditArgs(["--sample-limit", "0"])
    ).toThrow(/sample-limit/);
  });
});

describe("resolveDecorationWorkflowBusinessAuditDatabaseUrl", () => {
  test("prefers direct database url before pooled url", () => {
    expect(resolveDecorationWorkflowBusinessAuditDatabaseUrl({
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
      SUPABASE_DB_URL: "postgres://pooled",
    })).toBe("postgres://direct");
  });
});

describe("buildDecorationWorkflowBusinessAuditReport", () => {
  test("marks migration needed when legacy definitions remain", () => {
    const report = buildDecorationWorkflowBusinessAuditReport({
      generatedAt: "2026-06-17T00:00:00.000Z",
      checks: [
        {
          check_name: "active_customer_main_contains_signed_node",
          issue_count: 1,
        },
        {
          check_name: "active_construction_main_contains_project_signing_nodes",
          issue_count: 2,
        },
      ],
      affectedInstances: [
        {
          tenant_id: "tenant-1",
          definition_id: "definition-1",
          workflow_key: "construction_main",
          instance_id: "instance-1",
          subject_type: "project",
          subject_id: "project-1",
          current_node_key: "signed",
          issue_code: "running_legacy_construction_instance",
        },
      ],
    });

    expect(report).toEqual({
      generated_at: "2026-06-17T00:00:00.000Z",
      ok: false,
      needs_migration: true,
      needs_instance_review: true,
      total_issues: 3,
      checks: [
        {
          check_name: "active_customer_main_contains_signed_node",
          issue_count: 1,
        },
        {
          check_name: "active_construction_main_contains_project_signing_nodes",
          issue_count: 2,
        },
      ],
      affected_instances: [
        {
          tenant_id: "tenant-1",
          definition_id: "definition-1",
          workflow_key: "construction_main",
          instance_id: "instance-1",
          subject_type: "project",
          subject_id: "project-1",
          current_node_key: "signed",
          issue_code: "running_legacy_construction_instance",
        },
      ],
    });
  });

  test("separates running legacy instance review from template migration", () => {
    const report = buildDecorationWorkflowBusinessAuditReport({
      generatedAt: "2026-06-17T00:00:00.000Z",
      checks: [
        {
          check_name: "active_customer_main_contains_signed_node",
          issue_count: 0,
        },
        {
          check_name: "running_instances_on_legacy_snapshots",
          issue_count: 10,
        },
      ],
      affectedInstances: [
        {
          tenant_id: "tenant-1",
          definition_id: "definition-1",
          workflow_key: "customer_main",
          instance_id: "instance-1",
          subject_type: "customer",
          subject_id: "customer-1",
          current_node_key: "designing",
          issue_code: "running_legacy_customer_instance",
        },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.needs_migration).toBe(false);
    expect(report.needs_instance_review).toBe(true);
    expect(report.total_issues).toBe(10);
  });

  test("passes when no legacy definitions or instances remain", () => {
    const report = buildDecorationWorkflowBusinessAuditReport({
      generatedAt: "2026-06-17T00:00:00.000Z",
      checks: [
        {
          check_name: "active_customer_main_contains_signed_node",
          issue_count: 0,
        },
      ],
      affectedInstances: [],
    });

    expect(report.ok).toBe(true);
    expect(report.needs_migration).toBe(false);
    expect(report.needs_instance_review).toBe(false);
    expect(report.total_issues).toBe(0);
  });
});
