import { createServer } from "node:http";

const port = Number.parseInt(process.env.PROJECT_HEALTH_MOCK_BACKEND_PORT || "3999", 10);
const now = "2026-07-14T10:30:00+08:00";

const session = {
  user_id: "mock-admin-user",
  login_channel: "admin_web",
  employee: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "测试管理员",
    phone: "18800000001",
    status: "active",
    tenant_department_id: "22222222-2222-4222-8222-222222222222",
    department_name: "运营部",
    post_id: "33333333-3333-4333-8333-333333333333",
    post_name: "运营负责人",
    avatar: null,
  },
  tenant: {
    id: "44444444-4444-4444-8444-444444444444",
    name: "风险中心测试装修公司",
    slug: "risk-center-test",
    status: "active",
  },
  roles: ["tenant_admin"],
  permissions: [
    { code: "dashboard.read", scope: "all" },
    { code: "project.read", scope: "all" },
    { code: "project.workflow.read", scope: "all" },
  ],
  token: "mock-admin-token",
  expires_at: "2026-07-15T10:30:00+08:00",
};

const riskItems = [
  {
    risk_key: "workflow_task_overdue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    risk_type: "workflow_task_overdue",
    severity: "danger",
    project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    project_name: "湖畔雅居 12-1",
    project_status: "construction",
    source_type: "workflow_task",
    source_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    assignee_employee_id: "55555555-5555-4555-8555-555555555555",
    assignee_employee_name: "张工",
    occurred_at: "2026-07-10T09:00:00+08:00",
    due_at: "2026-07-11T18:00:00+08:00",
    overdue_days: 3,
    evidence: { node_name: "水电验收", overdue_days: 3 },
    title: "流程任务逾期",
    description: "湖畔雅居 12-1 的水电验收节点已逾期 3 天。",
    action: { label: "去处理", href: "/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?tab=overview" },
  },
  {
    risk_key: "procedure_overdue:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    risk_type: "procedure_overdue",
    severity: "danger",
    project_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    project_name: "江湾府 8-2",
    project_status: "construction",
    source_type: "procedure_assignment",
    source_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    assignee_employee_id: "66666666-6666-4666-8666-666666666666",
    assignee_employee_name: "李工",
    occurred_at: "2026-07-09T10:00:00+08:00",
    due_at: "2026-07-12T18:00:00+08:00",
    overdue_days: 2,
    evidence: { procedure_name: "瓦工铺贴", overdue_days: 2 },
    title: "施工阶段逾期",
    description: "江湾府 8-2 的瓦工铺贴阶段未按计划完成。",
    action: { label: "去处理", href: "/projects/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?tab=overview" },
  },
  {
    risk_key: "missing_project_log:cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    risk_type: "missing_project_log",
    severity: "warning",
    project_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    project_name: "云麓花园 3-1",
    project_status: "construction",
    source_type: "project_log_gap",
    source_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    assignee_employee_id: null,
    assignee_employee_name: null,
    occurred_at: "2026-07-13T09:00:00+08:00",
    due_at: null,
    overdue_days: 1,
    evidence: { missing_days: 1, latest_log_at: "2026-07-12T18:00:00+08:00" },
    title: "项目日志缺失",
    description: "云麓花园 3-1 最近 1 天没有新的施工日志。",
    action: { label: "去处理", href: "/projects/cccccccc-cccc-4ccc-8ccc-cccccccccccc?tab=logs" },
  },
  {
    risk_key: "acceptance_rework:dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    risk_type: "acceptance_rework",
    severity: "warning",
    project_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    project_name: "星河湾 5-2",
    project_status: "construction",
    source_type: "project_acceptance",
    source_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    assignee_employee_id: "77777777-7777-4777-8777-777777777777",
    assignee_employee_name: "王工",
    occurred_at: "2026-07-12T16:00:00+08:00",
    due_at: null,
    overdue_days: null,
    evidence: { rework_count: 2, acceptance_name: "泥木验收" },
    title: "验收返工",
    description: "星河湾 5-2 的泥木验收已有 2 次返工记录。",
    action: { label: "去处理", href: "/projects/dddddddd-dddd-4ddd-8ddd-dddddddddddd?tab=acceptances&acceptanceId=dddddddd-dddd-4ddd-8ddd-ddddddddddd1" },
  },
  {
    risk_key: "service_ticket:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    risk_type: "service_ticket",
    severity: "warning",
    project_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    project_name: "春江悦 6-1",
    project_status: "construction",
    source_type: "customer_service_ticket",
    source_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    assignee_employee_id: "88888888-8888-4888-8888-888888888888",
    assignee_employee_name: "赵经理",
    occurred_at: "2026-07-14T08:00:00+08:00",
    due_at: null,
    overdue_days: null,
    evidence: { ticket_priority: "high", customer_message: "客户询问延期原因" },
    title: "高优先级客服工单",
    description: "春江悦 6-1 有客户高优先级咨询待跟进。",
    action: { label: "去处理", href: "/customer-service?ticketId=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1" },
  },
];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function countByType(items) {
  return {
    workflow_task_overdue: items.filter((item) => item.risk_type === "workflow_task_overdue").length,
    procedure_overdue: items.filter((item) => item.risk_type === "procedure_overdue").length,
    missing_project_log: items.filter((item) => item.risk_type === "missing_project_log").length,
    acceptance_rework: items.filter((item) => item.risk_type === "acceptance_rework").length,
    service_ticket: items.filter((item) => item.risk_type === "service_ticket").length,
  };
}

function buildRiskPage(searchParams) {
  const severity = searchParams.get("severity") || "";
  const riskType = searchParams.get("risk_type") || "";
  const keyword = (searchParams.get("keyword") || "").trim().toLowerCase();
  const page = Number.parseInt(searchParams.get("page") || "1", 10);
  const pageSize = Number.parseInt(searchParams.get("pageSize") || "20", 10);

  const filteredItems = riskItems.filter((item) => {
    if (severity && item.severity !== severity) return false;
    if (riskType && item.risk_type !== riskType) return false;
    if (!keyword) return true;

    return [
      item.project_id,
      item.project_name,
      item.risk_key,
      item.title,
      item.description,
    ].some((value) => value.toLowerCase().includes(keyword));
  });
  const start = (Math.max(page, 1) - 1) * Math.max(pageSize, 1);
  const items = filteredItems.slice(start, start + pageSize);

  return {
    generated_at: now,
    business_date: "2026-07-14",
    summary: {
      total: filteredItems.length,
      danger: filteredItems.filter((item) => item.severity === "danger").length,
      warning: filteredItems.filter((item) => item.severity === "warning").length,
      info: 0,
      affected_projects: new Set(filteredItems.map((item) => item.project_id)).size,
      by_type: countByType(filteredItems),
    },
    diagnostics: {
      workflow_tasks_missing_due_at: 0,
    },
    items,
    pagination: {
      page: Math.max(page, 1),
      page_size: Math.max(pageSize, 1),
      total: filteredItems.length,
      total_pages: Math.ceil(filteredItems.length / Math.max(pageSize, 1)),
    },
  };
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `127.0.0.1:${port}`}`);

  if (request.method === "POST" && url.pathname === "/admin/auth/login") {
    await readBody(request);
    sendJson(response, 200, { success: true, data: session });
    return;
  }

  if (request.method === "GET" && url.pathname === "/admin/auth/me") {
    sendJson(response, 200, { success: true, data: session });
    return;
  }

  if (request.method === "GET" && url.pathname === "/project-health/risks") {
    if (url.searchParams.get("keyword") === "__server_error__") {
      sendJson(response, 500, {
        success: false,
        message: "模拟项目风险加载失败",
        code: "PROJECT_HEALTH_MOCK_FAILURE",
      });
      return;
    }

    sendJson(response, 200, { success: true, data: buildRiskPage(url.searchParams) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/project-health/ai-summary") {
    await readBody(request);
    sendJson(response, 200, {
      success: true,
      data: {
        overview: "当前有 5 条项目运营风险，其中 2 条为严重风险，建议先处理逾期流程和施工阶段。",
        priorities: [
          {
            risk_key: riskItems[0].risk_key,
            reason: "流程任务逾期已影响客户对进度的预期。",
            recommended_action: "由项目经理当天确认责任人和新的完成时间，并同步客户。",
          },
          {
            risk_key: riskItems[1].risk_key,
            reason: "施工阶段逾期会连带影响后续验收和付款节点。",
            recommended_action: "安排工程负责人复盘阻塞原因，必要时调整施工资源。",
          },
        ],
        cautions: ["AI 摘要仅用于运营排序，处理动作仍需结合项目现场事实。"],
      },
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/notifications/summary") {
    sendJson(response, 200, { success: true, data: { unread_count: 0 } });
    return;
  }

  if (request.method === "GET" && url.pathname === "/notifications") {
    sendJson(response, 200, {
      success: true,
      data: { list: [], pagination: { total: 0 } },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/notifications/read") {
    await readBody(request);
    sendJson(response, 200, { success: true, data: { unread_count: 0 } });
    return;
  }

  sendJson(response, 404, {
    success: false,
    message: `Mock backend route not found: ${request.method} ${url.pathname}`,
    code: "MOCK_ROUTE_NOT_FOUND",
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`[project-health-mock-backend] listening on http://127.0.0.1:${port}`);
});
