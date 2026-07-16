import { describe, expect, test } from "bun:test";
import type { ProjectOperationalRiskFact } from "@gooes/domain";
import { presentProjectOperationalRisk } from "./project-operational-risk-presentation";

const projectId = "11111111-1111-4111-8111-111111111111";

function fact(
  input: Partial<ProjectOperationalRiskFact> & Pick<ProjectOperationalRiskFact, "risk_type" | "source_type" | "source_id">,
): ProjectOperationalRiskFact {
  return {
    risk_key: `${input.source_type}:${input.source_id}`,
    severity: "warning",
    project_id: projectId,
    project_name: "湖畔花园",
    project_status: "constructing",
    assignee_employee_id: "33333333-3333-4333-8333-333333333333",
    assignee_employee_name: "张三",
    occurred_at: "2026-07-12T08:00:00.000Z",
    due_at: "2026-07-12T08:00:00.000Z",
    overdue_days: 2,
    evidence: {},
    ...input,
  };
}

describe("presentProjectOperationalRisk", () => {
  test("maps workflow overdue risk to overview action", () => {
    const item = presentProjectOperationalRisk(fact({
      risk_type: "workflow_task_overdue",
      source_type: "workflow_task",
      source_id: "22222222-2222-4222-8222-222222222222",
      evidence: { task_title: "水电验收" },
    }));

    expect(item.title).toBe("工作流任务逾期");
    expect(item.description).toContain("水电验收");
    expect(item.action).toEqual({
      label: "去处理",
      href: "/projects/11111111-1111-4111-8111-111111111111?tab=overview",
    });
  });

  test("maps procedure overdue risk to overview action", () => {
    const item = presentProjectOperationalRisk(fact({
      risk_type: "procedure_overdue",
      source_type: "procedure_assignment",
      source_id: "44444444-4444-4444-8444-444444444444",
      evidence: { procedure_name: "瓦工阶段", planned_end_date: "2026-07-10" },
    }));

    expect(item.title).toBe("施工工序延期");
    expect(item.description).toContain("瓦工阶段");
    expect(item.action.href).toContain("tab=overview");
  });

  test("maps missing log risk to logs action", () => {
    const item = presentProjectOperationalRisk(fact({
      risk_type: "missing_project_log",
      source_type: "project_log_gap",
      source_id: "77777777-7777-4777-8777-777777777777",
      evidence: { business_date: "2026-07-14", current_stage: "油漆" },
    }));

    expect(item.title).toBe("施工日志缺失");
    expect(item.action.href).toContain("tab=logs");
  });

  test("maps acceptance rework risk to acceptance action", () => {
    const item = presentProjectOperationalRisk(fact({
      risk_type: "acceptance_rework",
      source_type: "project_acceptance",
      source_id: "55555555-5555-4555-8555-555555555555",
      evidence: {
        acceptance_title: "水电验收",
        reject_source: "客户",
        reject_reason: "完整驳回内容不得展示",
      },
    }));

    expect(item.title).toBe("验收需要整改");
    expect(item.action.href).toBe(
      "/projects/11111111-1111-4111-8111-111111111111?tab=acceptances&acceptanceId=55555555-5555-4555-8555-555555555555",
    );
    expect(item.description).not.toContain("完整驳回内容");
    expect(item.description).not.toContain("reject_reason");
    expect(JSON.stringify(item.evidence)).not.toContain("完整驳回内容");
    expect(JSON.stringify(item.evidence)).not.toContain("reject_reason");
  });

  test("maps service ticket risk to customer service action without leaking content", () => {
    const item = presentProjectOperationalRisk(fact({
      risk_type: "service_ticket",
      source_type: "customer_service_ticket",
      source_id: "66666666-6666-4666-8666-666666666666",
      evidence: {
        ticket_no: "TK-001",
        priority: "urgent",
        unresolved_hours: 50,
        phone: "13800138000",
        address: "幸福路 88 号",
        content: "完整投诉内容",
      },
    }));

    expect(item.title).toBe("高优先级客服工单");
    expect(item.action.href).toBe(
      "/customer-service?ticketId=66666666-6666-4666-8666-666666666666",
    );
    expect(item.description).toContain("TK-001");
    expect(item.description).not.toContain("13800138000");
    expect(item.description).not.toContain("幸福路 88 号");
    expect(item.description).not.toContain("完整投诉内容");
    expect(JSON.stringify(item.evidence)).not.toContain("13800138000");
    expect(JSON.stringify(item.evidence)).not.toContain("幸福路 88 号");
    expect(JSON.stringify(item.evidence)).not.toContain("完整投诉内容");
  });

  test("does not render undefined or null placeholders", () => {
    const item = presentProjectOperationalRisk(fact({
      risk_type: "workflow_task_overdue",
      source_type: "workflow_task",
      source_id: "22222222-2222-4222-8222-222222222222",
      due_at: null,
      overdue_days: null,
    }));

    expect(item.description).not.toContain("undefined");
    expect(item.description).not.toContain("null");
  });
});
