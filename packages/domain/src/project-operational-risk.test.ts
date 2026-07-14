import { describe, expect, test } from "bun:test";
import {
  PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES,
  PROJECT_OPERATIONAL_RISK_TYPE_VALUES,
  ProjectOperationalRiskAiSummarySchema,
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
});
