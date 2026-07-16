import { describe, expect, test } from "bun:test";
import {
  ProjectOperationalRiskAiSummaryBodySchema,
  ProjectOperationalRiskListQuerySchema,
} from "./project-health";

describe("ProjectOperationalRiskListQuerySchema", () => {
  test("applies default pagination", () => {
    const result = ProjectOperationalRiskListQuerySchema.parse({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  test("rejects pageSize larger than 100", () => {
    expect(ProjectOperationalRiskListQuerySchema.safeParse({
      pageSize: "101",
    }).success).toBe(false);
  });

  test("normalizes empty filter values to undefined", () => {
    const result = ProjectOperationalRiskListQuerySchema.parse({
      risk_type: "",
      severity: " null ",
      keyword: " undefined ",
    });

    expect(result.risk_type).toBeUndefined();
    expect(result.severity).toBeUndefined();
    expect(result.keyword).toBeUndefined();
  });

  test("rejects unknown risk type", () => {
    expect(ProjectOperationalRiskListQuerySchema.safeParse({
      risk_type: "unknown",
    }).success).toBe(false);
  });

  test("rejects unknown severity", () => {
    expect(ProjectOperationalRiskListQuerySchema.safeParse({
      severity: "info",
    }).success).toBe(false);
  });

  test("rejects keyword longer than 100 characters", () => {
    expect(ProjectOperationalRiskListQuerySchema.safeParse({
      keyword: "装".repeat(101),
    }).success).toBe(false);
  });
});

describe("ProjectOperationalRiskAiSummaryBodySchema", () => {
  test("does not allow client uploaded items", () => {
    expect(ProjectOperationalRiskAiSummaryBodySchema.safeParse({
      risk_type: "workflow_task_overdue",
      items: [],
    }).success).toBe(false);
  });

  test("rejects array or object scalar filters", () => {
    expect(ProjectOperationalRiskAiSummaryBodySchema.safeParse({
      risk_type: ["workflow_task_overdue"],
    }).success).toBe(false);
    expect(ProjectOperationalRiskAiSummaryBodySchema.safeParse({
      keyword: { value: "延期" },
    }).success).toBe(false);
  });
});
