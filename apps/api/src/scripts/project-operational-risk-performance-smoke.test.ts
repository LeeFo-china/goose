import { describe, expect, test } from "bun:test";

import {
  normalizeSmokeConfig,
  percentile,
  parseApiRiskPayload,
  summarizeSamples,
} from "./project-operational-risk-performance-smoke";

describe("project operational risk performance smoke helpers", () => {
  test("calculates percentile with sorted ceil index", () => {
    const values = [90, 10, 80, 20, 70, 30, 60, 40, 50, 100];

    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(100);
    expect(percentile([], 0.95)).toBe(0);
  });

  test("summarizes samples with p50 and p95", () => {
    const summary = summarizeSamples([
      { phase: "rpc", round: 1, ms: 30, ok: true, total: 12, itemCount: 10 },
      { phase: "rpc", round: 2, ms: 10, ok: true, total: 12, itemCount: 10 },
      { phase: "rpc", round: 3, ms: 20, ok: true, total: 12, itemCount: 10 },
    ]);

    expect(summary).toEqual({
      count: 3,
      ok: 3,
      minMs: 10,
      avgMs: 20,
      p50Ms: 20,
      p95Ms: 30,
      maxMs: 30,
    });
  });

  test("normalizes read-only config and defaults iterations to 20", () => {
    const config = normalizeSmokeConfig({
      PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      PROJECT_HEALTH_API_URL: "https://api-dev.goodcms.cn",
      PROJECT_HEALTH_ADMIN_TOKEN: "admin-token",
    });

    expect(config).toEqual({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      iterations: 20,
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "service-role",
      apiUrl: "https://api-dev.goodcms.cn",
      adminToken: "admin-token",
    });
  });

  test("uses ADMIN_TOKEN as a compatibility alias for API smoke", () => {
    const config = normalizeSmokeConfig({
      PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      PROJECT_HEALTH_API_URL: "https://api-dev.goodcms.cn",
      ADMIN_TOKEN: "admin-token",
    });

    expect(config.adminToken).toBe("admin-token");
  });

  test("uses GOOES_API_BASE_URL as a compatibility alias for API smoke", () => {
    const config = normalizeSmokeConfig({
      PROJECT_HEALTH_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      GOOES_API_BASE_URL: "https://api-dev.goodcms.cn",
      PROJECT_HEALTH_ADMIN_TOKEN: "admin-token",
    });

    expect(config.apiUrl).toBe("https://api-dev.goodcms.cn");
  });

  test("reports missing required config without running writes", () => {
    expect(() => normalizeSmokeConfig({})).toThrow(
      "PROJECT_HEALTH_TENANT_ID is required",
    );
    expect(() =>
      normalizeSmokeConfig({
        PROJECT_HEALTH_TENANT_ID: "tenant-1",
        SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toThrow("SUPABASE_SERVICE_ROLE_KEY is required");
  });

  test("accepts API display payloads with action metadata", () => {
    const result = parseApiRiskPayload({
      responseOk: true,
      status: 200,
      payload: {
        success: true,
        data: {
          generated_at: "2026-07-14T08:00:00.000Z",
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
          items: [
            {
              risk_key: "workflow_task:22222222-2222-4222-8222-222222222222",
              risk_type: "workflow_task_overdue",
              severity: "danger",
              project_id: "11111111-1111-4111-8111-111111111111",
              project_name: "湖畔花园",
              project_status: "constructing",
              source_type: "workflow_task",
              source_id: "22222222-2222-4222-8222-222222222222",
              assignee_employee_id: null,
              assignee_employee_name: null,
              occurred_at: "2026-07-12T08:00:00.000Z",
              due_at: "2026-07-12T08:00:00.000Z",
              overdue_days: 2,
              evidence: { task_title: "水电验收" },
              title: "工作流任务逾期",
              description: "水电验收，逾期 2 天。",
              action: {
                label: "去处理",
                href: "/projects/11111111-1111-4111-8111-111111111111",
              },
            },
          ],
          pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
        },
      },
    });

    expect(result).toEqual({ ok: true, status: 200, total: 1, itemCount: 1 });
  });
});
