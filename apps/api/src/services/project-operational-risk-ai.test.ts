import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  ProjectOperationalRiskAiSummary,
  ProjectOperationalRiskDisplayItem,
} from "@gooes/domain";
import type { ProjectOperationalRiskListQuery } from "@/schema/project-health";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "11111111-1111-4111-8111-111111111111",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "张三",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [
    { code: "dashboard.read", scope: "all" },
    { code: "project.read", scope: "all" },
  ],
} satisfies AuthContext;

function riskItem(
  input: Partial<ProjectOperationalRiskDisplayItem> &
    Pick<ProjectOperationalRiskDisplayItem, "risk_key" | "risk_type">,
): ProjectOperationalRiskDisplayItem {
  return {
    risk_key: input.risk_key,
    risk_type: input.risk_type,
    severity: input.severity ?? "danger",
    project_id: input.project_id ?? "22222222-2222-4222-8222-222222222222",
    project_name: input.project_name ?? "湖畔花园",
    project_status: input.project_status ?? "constructing",
    source_type: input.source_type ?? "workflow_task",
    source_id: input.source_id ?? "33333333-3333-4333-8333-333333333333",
    assignee_employee_id: input.assignee_employee_id ?? null,
    assignee_employee_name: input.assignee_employee_name ?? "李工",
    occurred_at: input.occurred_at ?? "2026-07-12T08:00:00.000Z",
    due_at: input.due_at ?? "2026-07-12T08:00:00.000Z",
    overdue_days: input.overdue_days ?? 2,
    evidence: input.evidence ?? { task_title: "水电验收" },
    title: input.title ?? "工作流任务逾期",
    description: input.description ?? "水电验收，逾期 2 天。",
    action: input.action ?? {
      label: "去处理",
      href: "/projects/22222222-2222-4222-8222-222222222222?tab=overview",
    },
  };
}

function riskPage(items: ProjectOperationalRiskDisplayItem[]) {
  return {
    generated_at: "2026-07-14T08:00:00.000Z",
    business_date: "2026-07-14",
    summary: {
      total: items.length,
      danger: items.filter((item) => item.severity === "danger").length,
      warning: items.filter((item) => item.severity === "warning").length,
      info: 0,
      affected_projects: new Set(items.map((item) => item.project_id)).size,
      by_type: {
        workflow_task_overdue: items.filter(
          (item) => item.risk_type === "workflow_task_overdue",
        ).length,
        procedure_overdue: items.filter(
          (item) => item.risk_type === "procedure_overdue",
        ).length,
        missing_project_log: items.filter(
          (item) => item.risk_type === "missing_project_log",
        ).length,
        acceptance_rework: items.filter(
          (item) => item.risk_type === "acceptance_rework",
        ).length,
        service_ticket: items.filter((item) => item.risk_type === "service_ticket")
          .length,
      },
    },
    diagnostics: { workflow_tasks_missing_due_at: 0 },
    items,
    pagination: { page: 1, page_size: 20, total: items.length, total_pages: 1 },
  };
}

function createSubject(options?: {
  items?: ProjectOperationalRiskDisplayItem[];
  aiContent?: string;
  aiError?: unknown;
}) {
  const listRisks = mock(
    async (_authContext: AuthContext, _query: ProjectOperationalRiskListQuery) => ({
      data: riskPage(options?.items ?? [
        riskItem({
          risk_key: "workflow_task:33333333-3333-4333-8333-333333333333",
          risk_type: "workflow_task_overdue",
          evidence: {
            task_title: "水电验收",
            phone: "13800138000",
            address: "幸福路 88 号",
            content: "完整投诉内容",
            reject_reason: "客户提出整改细节",
          },
        }),
      ]),
      timing: { rpcMs: 8, serviceMs: 12 },
    }),
  );
  const chat = mock(async () => {
    if (options?.aiError) throw options.aiError;
    return {
      content:
        options?.aiContent ??
        JSON.stringify({
          overview: "当前最需要处理的是湖畔花园的工作流逾期。",
          priorities: [
            {
              risk_key: "workflow_task:33333333-3333-4333-8333-333333333333",
              reason: "逾期 2 天且影响后续验收。",
              recommended_action: "请项目负责人今天确认水电验收处理人和完成时间。",
            },
          ],
          cautions: ["不要承诺具体赔付或验收结果。"],
        } satisfies ProjectOperationalRiskAiSummary),
    };
  });

  return import("./project-operational-risk-ai").then(
    ({ ProjectOperationalRiskAiService }) => ({
      service: new ProjectOperationalRiskAiService({
        riskService: { listRisks },
        aiGateway: { chat },
      }),
      listRisks,
      chat,
    }),
  );
}

describe("ProjectOperationalRiskAiService", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("builds a sanitized prompt and calls ai gateway with risk summary scene", async () => {
    const { service, listRisks, chat } = await createSubject();

    const result = await service.generate(authContext, {
      risk_type: "workflow_task_overdue",
      severity: "danger",
      keyword: "湖畔",
    });

    expect(listRisks).toHaveBeenCalledWith(authContext, {
      risk_type: "workflow_task_overdue",
      severity: "danger",
      keyword: "湖畔",
      page: 1,
      pageSize: 20,
    });
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneCode: "project_operational_risk_summary",
        tenantId: "11111111-1111-4111-8111-111111111111",
        responseFormat: "json_object",
        timeoutMs: 30000,
        temperature: 0.2,
        source: "admin",
        billable: true,
      }),
    );
    const chatCalls = chat.mock.calls as unknown as Array<[
      { messages: Array<{ role: string; content: string }> },
    ]>;
    const chatInput = chatCalls[0]?.[0];
    if (!chatInput) {
      throw new Error("AI gateway was not called");
    }
    const prompt = JSON.stringify(chatInput.messages);
    expect(prompt).toContain("workflow_task:33333333-3333-4333-8333-333333333333");
    expect(prompt).toContain("overdue_days");
    expect(prompt).toContain("水电验收");
    expect(prompt).not.toContain("13800138000");
    expect(prompt).not.toContain("幸福路 88 号");
    expect(prompt).not.toContain("完整投诉内容");
    expect(prompt).not.toContain("reject_reason");
    expect(result.priorities).toHaveLength(1);
  });

  test("returns a stable summary without calling ai when no risks exist", async () => {
    const { service, chat } = await createSubject({ items: [] });

    const result = await service.generate(authContext, {});

    expect(result).toEqual({
      overview: "当前筛选范围内暂无项目运营风险。",
      priorities: [],
      cautions: [],
    });
    expect(chat).not.toHaveBeenCalled();
  });

  test.each([
    [
      "non-json response",
      "这不是 JSON",
    ],
    [
      "empty overview",
      JSON.stringify({ overview: " ", priorities: [], cautions: [] }),
    ],
    [
      "too many priorities",
      JSON.stringify({
        overview: "需要处理风险。",
        priorities: Array.from({ length: 6 }, (_, index) => ({
          risk_key: `workflow_task:${index}`,
          reason: "原因",
          recommended_action: "动作",
        })),
        cautions: [],
      }),
    ],
    [
      "unknown priority risk key",
      JSON.stringify({
        overview: "需要处理风险。",
        priorities: [
          {
            risk_key: "workflow_task:missing",
            reason: "原因",
            recommended_action: "动作",
          },
        ],
        cautions: [],
      }),
    ],
    [
      "overlong overview",
      JSON.stringify({
        overview: "超".repeat(801),
        priorities: [],
        cautions: [],
      }),
    ],
  ])("rejects invalid ai output: %s", async (_name, aiContent) => {
    const { service } = await createSubject({ aiContent });

    await expect(service.generate(authContext, {})).rejects.toMatchObject({
      statusCode: 502,
      code: "PROJECT_OPERATIONAL_RISK_AI_INVALID_RESPONSE",
      message: "AI 经营摘要格式异常，请重试",
    });
  });

  test("propagates gateway failure from the independent ai request", async () => {
    const upstreamError = Object.assign(new Error("upstream timeout"), {
      code: "AI_GATEWAY_FAILED",
    });
    const { service, listRisks } = await createSubject({ aiError: upstreamError });

    await expect(service.generate(authContext, {})).rejects.toBe(upstreamError);
    expect(listRisks).toHaveBeenCalledWith(authContext, {
      page: 1,
      pageSize: 20,
    });
  });
});
