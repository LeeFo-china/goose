import { describe, expect, test } from "bun:test";
import {
  PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES,
  PROJECT_OPERATIONAL_RISK_TYPE_VALUES,
  ProjectOperationalRiskAiSummarySchema,
  ProjectOperationalRiskDisplayPageSchema,
  ProjectOperationalRiskRpcPageSchema,
} from "./index";

describe("project operational risk contract", () => {
  test("exports the five v1 risk types and two severities", () => {
    expect(PROJECT_OPERATIONAL_RISK_TYPE_VALUES).toEqual([
      "workflow_task_overdue",
      "procedure_overdue",
      "missing_project_log",
      "acceptance_rework",
      "service_ticket",
    ]);
    expect(PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES).toEqual([
      "warning",
      "danger",
    ]);
  });

  test("rejects a malformed RPC fact instead of accepting partial data", () => {
    const result = ProjectOperationalRiskRpcPageSchema.safeParse({
      generated_at: new Date().toISOString(),
      business_date: "2026-07-14",
      summary: {},
      diagnostics: {},
      items: [{ risk_type: "unknown" }],
      pagination: {},
    });
    expect(result.success).toBe(false);
  });

  test("accepts the API display page with action metadata", () => {
    const result = ProjectOperationalRiskDisplayPageSchema.safeParse({
      generated_at: new Date().toISOString(),
      business_date: "2026-07-14",
      summary: {
        total: 1,
        danger: 1,
        warning: 0,
        info: 0,
        affected_projects: 1,
        by_type: {
          workflow_task_overdue: 1,
          procedure_overdue: 0,
          missing_project_log: 0,
          acceptance_rework: 0,
          service_ticket: 0,
        },
      },
      diagnostics: { workflow_tasks_missing_due_at: 0 },
      items: [{
        risk_key: "workflow_task:00000000-0000-4000-8000-000000000001",
        risk_type: "workflow_task_overdue",
        severity: "danger",
        project_id: "11111111-1111-4111-8111-111111111111",
        project_name: "湖畔花园",
        project_status: "constructing",
        source_type: "workflow_task",
        source_id: "00000000-0000-4000-8000-000000000001",
        assignee_employee_id: null,
        assignee_employee_name: "李工",
        occurred_at: "2026-07-14T08:00:00.000Z",
        due_at: "2026-07-13T08:00:00.000Z",
        overdue_days: 1,
        evidence: { task_title: "水电验收" },
        title: "工作流任务逾期",
        description: "水电验收逾期。",
        action: { label: "去处理", href: "/projects/11111111-1111-4111-8111-111111111111?tab=overview" },
      }],
      pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
    });

    expect(result.success).toBe(true);
  });

  test("bounds AI priorities to five items", () => {
    expect(ProjectOperationalRiskAiSummarySchema.safeParse({
      overview: "先处理严重延期。",
      priorities: Array.from({ length: 6 }, (_, index) => ({
        risk_key: `risk-${index}`,
        reason: "已逾期",
        recommended_action: "核对计划",
      })),
      cautions: [],
    }).success).toBe(false);
  });

  test("allows AI priority text up to 300 characters and does not bound caution text", () => {
    expect(ProjectOperationalRiskAiSummarySchema.safeParse({
      overview: "先处理严重延期。",
      priorities: [{
        risk_key: "r".repeat(300),
        reason: "已逾期",
        recommended_action: "核对计划",
      }],
      cautions: ["提示".repeat(151)],
    }).success).toBe(true);
  });
});
