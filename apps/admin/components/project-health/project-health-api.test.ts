import { describe, expect, test } from "bun:test";
import type {
  ProjectOperationalRiskAiSummary,
  ProjectOperationalRiskDisplayPage,
} from "@gooes/domain";
import {
  fetchProjectHealthAiSummary,
  fetchProjectHealthRisks,
  type ProjectHealthFetcher,
} from "./project-health-api";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createRiskPage(): ProjectOperationalRiskDisplayPage {
  return {
    generated_at: "2026-07-14T08:00:00.000Z",
    business_date: "2026-07-14",
    summary: {
      total: 0,
      danger: 0,
      warning: 0,
      info: 0,
      affected_projects: 0,
      by_type: {
        workflow_task_overdue: 0,
        procedure_overdue: 0,
        missing_project_log: 0,
        acceptance_rework: 0,
        service_ticket: 0,
      },
    },
    diagnostics: { workflow_tasks_missing_due_at: 0 },
    items: [
      {
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
        action: {
          label: "去处理",
          href: "/projects/11111111-1111-4111-8111-111111111111?tab=overview",
        },
      },
    ],
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
  };
}

describe("project health api helpers", () => {
  test("fetches risks through backend proxy with signal", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const signal = new AbortController().signal;
    const fetcher: ProjectHealthFetcher = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ success: true, data: createRiskPage() });
    };

    const data = await fetchProjectHealthRisks(
      { page: 2, severity: "danger", keyword: "湖畔" },
      { signal, fetcher },
    );

    expect(data.pagination.page).toBe(1);
    expect(data.items[0]?.action.href).toBe(
      "/projects/11111111-1111-4111-8111-111111111111?tab=overview",
    );
    expect(String(calls[0]?.input)).toBe(
      "/api/backend/project-health/risks?page=2&pageSize=20&severity=danger&keyword=%E6%B9%96%E7%95%94",
    );
    expect(calls[0]?.init?.signal).toBe(signal);
  });

  test("posts ai summary filters without page or items", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const summary: ProjectOperationalRiskAiSummary = {
      overview: "需优先处理高风险项目。",
      priorities: [],
      cautions: [],
    };
    const fetcher: ProjectHealthFetcher = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ success: true, data: summary });
    };

    await fetchProjectHealthAiSummary(
      {
        page: 9,
        severity: "warning",
        riskType: "service_ticket",
        keyword: "投诉",
      },
      { fetcher },
    );

    expect(String(calls[0]?.input)).toBe(
      "/api/backend/project-health/ai-summary",
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      severity: "warning",
      risk_type: "service_ticket",
      keyword: "投诉",
    });
  });

  test("throws readable backend errors without leaking response body", async () => {
    const fetcher: ProjectHealthFetcher = async () =>
      jsonResponse(
        {
          success: false,
          message: "风险列表加载失败",
          debug: "sensitive raw detail",
        },
        { status: 500 },
      );

    await expect(fetchProjectHealthRisks({}, { fetcher })).rejects.toThrow(
      "风险列表加载失败",
    );
    await expect(fetchProjectHealthRisks({}, { fetcher })).rejects.not.toThrow(
      "sensitive raw detail",
    );
  });

  test("uses fallback instead of raw backend error field", async () => {
    const fetcher: ProjectHealthFetcher = async () =>
      jsonResponse(
        {
          success: false,
          error: "database stack trace should stay private",
        },
        { status: 500 },
      );

    await expect(fetchProjectHealthRisks({}, { fetcher })).rejects.toThrow(
      "风险列表加载失败",
    );
    await expect(fetchProjectHealthRisks({}, { fetcher })).rejects.not.toThrow(
      "database stack trace",
    );
  });

  test("treats missing data as protocol error", async () => {
    const fetcher: ProjectHealthFetcher = async () =>
      jsonResponse({ success: true });

    await expect(fetchProjectHealthRisks({}, { fetcher })).rejects.toThrow(
      "风险列表响应缺少 data",
    );
  });

  test("rejects malformed successful risk payloads", async () => {
    const fetcher: ProjectHealthFetcher = async () =>
      jsonResponse({
        success: true,
        data: { items: "not an array" },
      });

    await expect(fetchProjectHealthRisks({}, { fetcher })).rejects.toThrow(
      "风险列表响应格式异常",
    );
  });

  test("rejects malformed successful ai summary payloads", async () => {
    const fetcher: ProjectHealthFetcher = async () =>
      jsonResponse({
        success: true,
        data: { overview: "ok", priorities: [{ risk_key: "missing fields" }] },
      });

    await expect(fetchProjectHealthAiSummary({}, { fetcher })).rejects.toThrow(
      "AI 摘要响应格式异常",
    );
  });
});
