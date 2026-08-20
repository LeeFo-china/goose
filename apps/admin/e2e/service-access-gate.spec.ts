import { expect, test } from "@playwright/test";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import {
  blockedTitle, createBrowserActivityMonitor, expectBlockedPage,
  expectMonitorWaitsForActiveRequest, personaNames as personas, purchaseUrl,
} from "./service-access-mock-fixture.mjs";
const mockBackendBaseUrl = "http://127.0.0.1:3992";
const expiredCopy = "租户服务访问已到期";
type Persona = typeof personas[keyof typeof personas];
type MockState = {
  requestCounts: Record<string, number>;
  requestQueries: Record<string, string[]>;
  forbiddenRequests: string[];
  hardBlockedRequests: string[];
  unexpectedRequests: string[];
  trialApplications: number;
  purchaseHandoffs: number;
  orderCreationAttempts: number;
  paymentCreationAttempts: number;
  runtime402Remaining: number;
  runtimeBlocked: boolean;
};
type SessionData = { expires_at: string; token: string; user_id: string };
type PaginationMetadata = { page: number; pageSize: number; total: number; totalPages: number };
let browserMonitor: ReturnType<typeof createBrowserActivityMonitor>;
let browserToken: string;
async function resetMock(request: APIRequestContext, persona: Persona, options: {
  serviceAccess503?: boolean; runtime402?: boolean;
} = {}): Promise<void> {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`, {
    data: { persona, ...options },
  });
  expect(response.ok()).toBe(true);
}
async function readSession(response: APIResponse): Promise<SessionData> {
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { data: SessionData };
  return payload.data;
}
async function login(page: Page): Promise<SessionData> {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18800000001", code: "" },
  });
  return readSession(response);
}
async function issueMockSession(
  request: APIRequestContext, persona: Persona,
): Promise<SessionData> {
  await resetMock(request, persona);
  const response = await request.post(`${mockBackendBaseUrl}/admin/auth/login`);
  return readSession(response);
}
async function setupPersona(
  page: Page, request: APIRequestContext, persona: Persona,
  options: { serviceAccess503?: boolean; runtime402?: boolean } = {},
): Promise<string> {
  await resetMock(request, persona, options);
  return (await login(page)).token;
}
function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
async function readState(request: APIRequestContext): Promise<MockState> {
  await browserMonitor.settle();
  const response = await request.get(`${mockBackendBaseUrl}/__test/state`);
  expect(response.ok()).toBe(true);
  return await response.json() as MockState;
}
function requestCount(state: MockState, method: string, path: string): number {
  return state.requestCounts[`${method} ${path}`] ?? 0;
}
function expectOnlyFirstPageQueries(state: MockState, method: string, path: string): void {
  const queries = state.requestQueries[`${method} ${path}`] ?? [];
  expect(queries.length).toBeGreaterThan(0);
  expect([...new Set(queries)]).toEqual(["?page=1&pageSize=20"]);
}
function expectObservedPagination(
  state: MockState, path: string, page: number, pageSize: number,
): void {
  const queries = state.requestQueries[`GET ${path}`] ?? [];
  expect(queries.length).toBeGreaterThan(0);
  for (const query of queries) {
    const parameters = new URLSearchParams(query);
    expect(parameters.getAll("page")).toEqual([String(page)]);
    expect(parameters.getAll("pageSize")).toEqual([String(pageSize)]);
  }
}
function expectBoundedProjectQueries(state: MockState): void {
  const queries = state.requestQueries["GET /projects"] ?? [];
  expect(queries.length).toBeGreaterThan(0);
  let observedInitialPage = false;
  for (const query of queries) {
    const parameters = new URLSearchParams(query);
    const pages = parameters.getAll("page");
    const pageSizes = parameters.getAll("pageSize");
    const page = Number(pages[0]);
    const pageSize = Number(pageSizes[0]);
    expect(pages).toHaveLength(1);
    expect(pageSizes).toHaveLength(1);
    expect(Number.isInteger(page) && page > 0).toBe(true);
    expect(Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 100)
      .toBe(true);
    expect(parameters.getAll("workflow_summary")).toEqual(["list"]);
    observedInitialPage ||= page === 1 && pageSize === 7;
  }
  expect(observedInitialPage).toBe(true);
}
async function expectPaginationMetadata(
  request: APIRequestContext, token: string, path: string, total: number,
): Promise<void> {
  const response = await request.get(`${mockBackendBaseUrl}${path}`, {
    headers: bearer(token),
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { data?: { pagination?: PaginationMetadata } };
  const parameters = new URL(path, mockBackendBaseUrl).searchParams;
  const page = Number(parameters.get("page"));
  const pageSize = Number(parameters.get("pageSize"));
  expect(payload.data?.pagination).toEqual({
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  });
}
async function expectInvalidPaginationRejected(
  request: APIRequestContext, token: string,
): Promise<void> {
  const invalidUrls = [
    "/billing/service-trials",
    "/billing/service-products?page=2&pageSize=20",
    "/billing/service-orders?page=1&pageSize=100",
    "/billing/ledger?page=1",
    "/projects?pageSize=7&workflow_summary=list",
    "/projects?page=1&pageSize=101&workflow_summary=list",
    "/projects/create/customers?pageSize=80",
    "/projects/create/customers?page=1&pageSize=101",
  ];
  for (const path of invalidUrls) {
    const response = await request.get(`${mockBackendBaseUrl}${path}`, {
      headers: bearer(token),
    });
    expect(response.status()).toBe(400);
  }
  const state = await readState(request);
  expect(state.unexpectedRequests).toEqual(
    invalidUrls.map((path) => `GET ${path}`),
  );
}
async function expectAuthorizationIsolation(request: APIRequestContext): Promise<string> {
  const issued: Array<readonly [Persona, SessionData]> = [];
  for (const persona of Object.values(personas)) {
    issued.push([persona, await issueMockSession(request, persona)]);
  }
  const sessionsByPersona = Object.fromEntries(issued) as Record<Persona, SessionData>;
  expect(new Set(issued.map(([, session]) => session.token)).size)
    .toBe(Object.values(personas).length);
  for (const [, session] of issued) {
    expect(session.expires_at).toBe("2099-12-31T23:59:59.000+08:00");
  }
  await resetMock(request, personas.blockedEmployee);
  const admin = sessionsByPersona[personas.blockedAdmin];
  const employee = sessionsByPersona[personas.blockedEmployee];
  const stale = await request.get(`${mockBackendBaseUrl}/admin/auth/me`, {
    headers: bearer(admin.token),
  });
  expect((await stale.json() as { data: SessionData }).data.user_id)
    .toBe(admin.user_id);
  const access = await request.get(`${mockBackendBaseUrl}/employee/service-access`, {
    headers: bearer(admin.token),
  });
  expect((await access.json() as { data: { primaryAction: { key: string } } })
    .data.primaryAction.key).toBe("apply_trial");
  for (const path of ["/admin/auth/me", "/projects?page=1&pageSize=7"]) {
    for (const headers of [{}, bearer("unknown-token")]) {
      const response = await request.get(`${mockBackendBaseUrl}${path}`, { headers });
      expect(response.status()).toBe(401);
      expect(await response.json()).toMatchObject({
        success: false,
        code: "UNAUTHORIZED",
        message: "登录状态无效",
      });
    }
  }
  const productsPath = "/billing/service-products?page=1&pageSize=20";
  expect((await request.get(`${mockBackendBaseUrl}${productsPath}`, {
    headers: bearer(admin.token),
  })).status()).toBe(200);
  expect((await request.get(`${mockBackendBaseUrl}${productsPath}`, {
    headers: bearer(employee.token),
  })).status()).toBe(403);
  return admin.token;
}
async function expectCleanMockState(
  request: APIRequestContext,
  requestBounds: Record<string, number> = {},
): Promise<MockState> {
  const state = await readState(request);
  expect(state.forbiddenRequests).toEqual([]);
  expect(state.unexpectedRequests).toEqual([]);
  expect(state.orderCreationAttempts).toBe(0);
  expect(state.paymentCreationAttempts).toBe(0);
  for (const [key, maximum] of Object.entries(requestBounds)) {
    expect(state.requestCounts[key] ?? 0).toBeLessThanOrEqual(maximum);
  }
  return state;
}
test.beforeEach(async ({ page, request }) => {
  browserMonitor = createBrowserActivityMonitor(page);
  browserToken = await setupPersona(page, request, personas.blockedAdmin);
});
test.afterEach(async () => {
  await browserMonitor.settle();
  expect(browserMonitor.errors.page).toEqual([]);
  expect(browserMonitor.errors.console).toEqual([]);
});
test("阻断管理员访问项目后收敛到唯一权威标题", async ({ page, request }) => {
  await page.goto("/projects");
  await expectBlockedPage(page);
  const state = await expectCleanMockState(request, {
    "GET /admin/auth/me": 3,
    "GET /employee/service-access": 3,
    "GET /projects": 2,
  });
  expect(requestCount(state, "GET", "/employee/service-access"))
    .toBeGreaterThanOrEqual(1);
});
test("阻断页不显示通用到期文案", async ({ page, request }) => {
  await page.goto("/service-access");
  await expectBlockedPage(page);
  await expectMonitorWaitsForActiveRequest(page, browserMonitor);
  await expect(page.getByText(expiredCopy, { exact: true })).toHaveCount(0);
  await expectCleanMockState(request, {
    "GET /employee/service-access": 2,
  });
});
test("有权限管理员可提交试用并发起受控购买跳转", async ({ page, request }) => {
  browserToken = await expectAuthorizationIsolation(request);
  await resetMock(request, personas.blockedAdmin);
  await expectInvalidPaginationRejected(request, browserToken);
  await expectPaginationMetadata(request, browserToken,
    "/projects?page=2&pageSize=7&workflow_summary=list&ownership=all", 0);
  await expectPaginationMetadata(request, browserToken,
    "/projects/create/employees?scene=project_designer&page=1&pageSize=80", 0);
  await expectPaginationMetadata(request, browserToken,
    "/projects/create/properties?customer_id=a1000000-0000-4000-8000-000000000001&page=1&pageSize=80", 0);
  for (const path of [
    "/billing/service-trials",
    "/billing/service-products",
    "/billing/service-orders",
    "/billing/ledger",
  ]) {
    await expectPaginationMetadata(request, browserToken,
      `${path}?page=1&pageSize=20`, path === "/billing/service-products" ? 1 : 0);
  }
  browserToken = await setupPersona(page, request, personas.blockedAdmin);
  await expectPaginationMetadata(request, browserToken,
    "/billing/service-trials?page=1&pageSize=20", 0);
  let interceptedHandoffs = 0;
  await page.route(purchaseUrl, async (route) => {
    interceptedHandoffs += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>mock purchase handoff</title>",
    });
  });
  await page.goto("/service-access");
  await expectBlockedPage(page);
  await page.getByLabel("试用目的").fill("E2E 服务门禁回归");
  await page.getByLabel("预计使用人数").fill("8");
  await page.getByLabel("预计项目数量").fill("20");
  await page.getByLabel("联系人").fill("测试联系人");
  await page.getByLabel("中国大陆手机号").fill("13800138000");
  await page.getByRole("button", { name: "提交试用申请" }).click();
  await expect(page.getByText("试用申请已提交，请等待平台审核。")).toBeVisible();

  await expect(page.getByText("平台技术服务一年版")).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近服务订单" })).toBeVisible();
  await page.getByRole("button", { name: "打开微信小程序购买" }).click();
  await expect(page).toHaveURL(purchaseUrl);
  expect(interceptedHandoffs).toBe(1);

  const state = await expectCleanMockState(request, {
    "GET /billing/service-trials": 1,
    "GET /billing/service-products": 2,
    "GET /billing/service-orders": 2,
    "POST /billing/service-trials/applications": 1,
    "POST /employee/service-access/purchase-link": 1,
  });
  expect(state.trialApplications).toBe(1);
  expect(state.purchaseHandoffs).toBe(1);
  for (const path of [
    "/billing/service-trials",
    "/billing/service-products",
    "/billing/service-orders",
  ]) {
    expectOnlyFirstPageQueries(state, "GET", path);
  }
});

test("普通员工只有联系管理员提示且不请求恢复能力", async ({ page, request }) => {
  await setupPersona(page, request, personas.blockedEmployee);
  await page.goto("/service-access");
  await expectBlockedPage(page);
  await expect(page.getByText("请联系企业管理员处理。").first())
    .toBeVisible();
  await expect(page.getByRole("button", { name: /申请试用|提交试用申请/ }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开微信小程序购买" }))
    .toHaveCount(0);

  const state = await expectCleanMockState(request);
  for (const path of [
    "/billing/service-trials/current",
    "/billing/service-trials",
    "/billing/service-products",
    "/billing/service-orders",
  ]) {
    expect(requestCount(state, "GET", path)).toBe(0);
  }
  expect(requestCount(
    state,
    "POST",
    "/employee/service-access/purchase-link",
  )).toBe(0);
});

test("计费恢复页区分可恢复阻断与强阻断", async ({ page, request }) => {
  await page.goto("/billing");
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole("heading", { name: "计费账户", level: 1 }))
    .toBeVisible();
  let state = await expectCleanMockState(request);
  expectOnlyFirstPageQueries(state, "GET", "/billing/ledger");

  await setupPersona(page, request, personas.hardBlocked);
  await page.goto("/billing");
  await expect(page).toHaveURL(/\/service-access$/);
  await expect(page.getByRole("heading", { name: "企业账号暂不可用", level: 1 }))
    .toBeVisible();
  await expect(page.getByText("请联系平台客服处理", { exact: true }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "刷新状态" })).toBeVisible();
  await expect(page.getByRole("link", { name: "计费账户" }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: /申请试用|提交试用申请/ }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开微信小程序购买" }))
    .toHaveCount(0);
  state = await expectCleanMockState(request);
  expect([...new Set(state.hardBlockedRequests)].sort()).toEqual([
    "GET /billing/feature-estimates",
    "GET /billing/ledger",
    "GET /billing/summary",
  ]);
});

test("宽限期从唯一横幅发现并完成受控购买跳转", async ({ page, request }) => {
  await setupPersona(page, request, personas.graceTenant);
  let interceptedHandoffs = 0;
  await page.route(purchaseUrl, async (route) => {
    interceptedHandoffs += 1;
    await route.fulfill({ status: 200, body: "grace purchase handoff" });
  });
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects(?:\?.*)?$/);
  await expect(page.getByText("只读宽限期", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/宽限期截止：2026年08月31日 23:59/))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "项目管理", level: 1 }))
    .toHaveCount(1);
  await page.getByRole("link", { name: "购买正式服务" }).click();
  await expect(page).toHaveURL(/\/service-access$/);
  await expect(page.getByText("平台技术服务一年版")).toBeVisible();
  await page.getByRole("button", { name: "打开微信小程序购买" }).click();
  await expect(page).toHaveURL(purchaseUrl);
  expect(interceptedHandoffs).toBe(1);
  const state = await expectCleanMockState(request, {
    "GET /employee/service-access": 2,
    "GET /projects": 3,
    "GET /billing/service-products": 2,
    "GET /billing/service-orders": 2,
    "POST /employee/service-access/purchase-link": 1,
  });
  expectBoundedProjectQueries(state);
  expect(state.purchaseHandoffs).toBe(1);
});

test("正常租户与平台员工都留在项目页", async ({ page, request }) => {
  await setupPersona(page, request, personas.normalTenant);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "项目管理", level: 1 }))
    .toHaveCount(1);
  let state = await expectCleanMockState(request, {
    "GET /employee/service-access": 2,
    "GET /projects": 3,
  });
  expect(requestCount(state, "GET", "/employee/service-access"))
    .toBeGreaterThanOrEqual(1);
  expectBoundedProjectQueries(state);

  await setupPersona(page, request, personas.platformStaff);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "当前为平台管理模式" }))
    .toHaveCount(1);
  await expect(page.getByRole("link", { name: "平台概览" })).toBeVisible();
  await expect(page.getByRole("link", { name: "平台人员" })).toHaveCount(0);
  state = await expectCleanMockState(request, { "GET /projects": 3 });
  expect(requestCount(state, "GET", "/employee/service-access")).toBe(0);
});

test("运行时一次性 402 只触发一次替换并稳定收敛", async ({ page, request }) => {
  await setupPersona(page, request, personas.normalTenant, { runtime402: true });
  await page.addInitScript(() => {
    const nativeFetch = window.fetch;
    const interceptedFetch = async (
      input: Parameters<typeof window.fetch>[0],
      init?: Parameters<typeof window.fetch>[1],
    ): Promise<Response> => {
      const requestUrl = typeof input === "string" ? input
        : input instanceof URL ? input.href : input.url;
      const method = (init?.method
        ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = new URL(requestUrl, window.location.origin);
      if (method !== "POST" || url.pathname !== "/api/backend/projects")
        return nativeFetch(input, init);

      url.searchParams.set("__e2eSynthetic402", "1");
      const response = await nativeFetch(url, init);
      const payload = await response.clone().json().catch(() => null) as { code?: unknown } | null;
      if (payload?.code !== "TENANT_SERVICE_ACCESS_EXPIRED") return response;
      return new Response(response.body, {
        status: 402,
        statusText: "Payment Required",
        headers: response.headers,
      });
    };
    window.fetch = Object.assign(interceptedFetch, { preconnect: nativeFetch.preconnect });
  });
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "项目管理", level: 1 })).toHaveCount(1);
  const protectedEntryHistoryLength = await page.evaluate(() => window.history.length);

  const runtimeNavigationPaths: string[] = [];
  page.on("request", (browserRequest) => {
    if (!browserRequest.isNavigationRequest()) return;
    runtimeNavigationPaths.push(new URL(browserRequest.url()).pathname);
  });
  await page.getByRole("button", { name: "新增项目" }).click();
  await page.getByLabel("项目名称").fill("运行时 402 回归项目");
  await page.getByRole("button", { name: "创建项目" }).click();
  await expectBlockedPage(page);
  const state = await expectCleanMockState(request, {
    "POST /projects": 1,
    "GET /employee/service-access": 3,
  });
  expect(await page.evaluate(() => window.history.length)).toBe(protectedEntryHistoryLength);
  expect(requestCount(state, "POST", "/projects")).toBe(1);
  expect(state.runtime402Remaining).toBe(0);
  expect(state.runtimeBlocked).toBe(true);
  expectBoundedProjectQueries(state);
  for (const path of [
    "/projects/create/customers",
    "/projects/create/employees",
    "/projects/create/construction-workflows",
  ]) {
    expectObservedPagination(state, path, 1, 80);
  }
  expect(runtimeNavigationPaths.filter((path) => path === "/service-access")).toHaveLength(1);

  const navigationCountBeforeBack = runtimeNavigationPaths.length;
  await page.goBack({ waitUntil: "domcontentloaded" });
  expect(runtimeNavigationPaths.slice(navigationCountBeforeBack)).not.toContain("/projects");
  expect(new URL(page.url()).pathname).not.toBe("/projects");
});

test("服务状态 503 显示可重试系统错误而非到期结论", async ({ page, request }) => {
  await setupPersona(page, request, personas.blockedAdmin, {
    serviceAccess503: true,
  });
  await page.goto("/service-access");
  await expect(page).toHaveURL(/\/service-access$/);
  await expect(page.getByText("系统错误", { exact: true })).toBeVisible();
  await expect(page.getByText("服务状态暂时无法加载，请稍后重试", {
    exact: true,
  })).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(page.getByText(expiredCopy, { exact: true })).toHaveCount(0);
  await expect(page.getByText(blockedTitle, { exact: true })).toHaveCount(0);

  const state = await expectCleanMockState(request, {
    "GET /employee/service-access": 2,
  });
  expect(requestCount(state, "GET", "/employee/service-access"))
    .toBeGreaterThanOrEqual(1);
});
