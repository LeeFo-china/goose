import { describe, expect, test } from "bun:test";
import {
  formatOverdueDays,
  formatProjectRiskDateTime,
  formatProjectRiskEvidence,
  getProjectOperationalRiskSeverityMeta,
  getProjectOperationalRiskTypeLabel,
} from "./project-health-display";

describe("project health display helpers", () => {
  test("maps every risk type to a business label", () => {
    expect(getProjectOperationalRiskTypeLabel("workflow_task_overdue")).toBe(
      "流程任务逾期",
    );
    expect(getProjectOperationalRiskTypeLabel("procedure_overdue")).toBe(
      "施工阶段逾期",
    );
    expect(getProjectOperationalRiskTypeLabel("missing_project_log")).toBe(
      "项目日志缺失",
    );
    expect(getProjectOperationalRiskTypeLabel("acceptance_rework")).toBe(
      "验收返工",
    );
    expect(getProjectOperationalRiskTypeLabel("service_ticket")).toBe(
      "客服问题",
    );
  });

  test("returns severity label, badge variant and icon semantic", () => {
    expect(getProjectOperationalRiskSeverityMeta("danger")).toEqual({
      label: "高风险",
      badgeVariant: "destructive",
      icon: "alert-triangle",
    });
    expect(getProjectOperationalRiskSeverityMeta("warning")).toEqual({
      label: "需关注",
      badgeVariant: "secondary",
      icon: "circle-alert",
    });
  });

  test("formats date time for Chinese operators", () => {
    expect(formatProjectRiskDateTime("2026-07-14T08:30:00.000Z")).toContain(
      "2026",
    );
    expect(formatProjectRiskDateTime("2026-07-14T08:30:00.000Z")).toContain(
      "16:30",
    );
    expect(formatProjectRiskDateTime(null)).toBe("-");
  });

  test("formats overdue days", () => {
    expect(formatOverdueDays(0)).toBe("今天到期");
    expect(formatOverdueDays(3)).toBe("逾期 3 天");
    expect(formatOverdueDays(null)).toBe("未计算");
  });

  test("formats at most two evidence entries with overflow indicator", () => {
    expect(
      formatProjectRiskEvidence({
        节点: "水电验收",
        负责人: "张三",
        逾期天数: 4,
      }),
    ).toEqual(["节点：水电验收", "负责人：张三", "+1"]);
  });
});
