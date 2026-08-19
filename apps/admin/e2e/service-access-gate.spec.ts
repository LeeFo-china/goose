import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3992";
const purchaseUrl = "https://wxaurl.cn/mockServiceAccessPurchase";
const blockedTitle = "尚未开通平台技术服务";
const expiredCopy = "租户服务访问已到期";

const personas = {
  blockedAdmin: "blocked_admin",
  blockedEmployee: "blocked_employee",
  graceTenant: "grace_tenant",
  normalTenant: "normal_tenant",
  platformAdmin: "platform_admin",
} as const;

type Persona = typeof personas[keyof typeof personas];

type MockState = {
  requestCounts: Record<string, number>;
  requestQueries: Record<string, string[]>;
  forbiddenRequests: string[];
  unexpectedRequests: string[];
  trialApplications: number;
  purchaseHandoffs: number;
  orderCreationAttempts: number;
  paymentCreationAttempts: number;
  runtime402Remaining: number;
  runtimeBlocked: boolean;
};

type BrowserErrors = {
  page: string[];
  console: string[];
};

let browserErrors: BrowserErrors;

function captureBrowserErrors(page: Page): BrowserErrors {
  const captured: BrowserErrors = { page: [], console: [] };
  page.on("pageerror", (error) => captured.page.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") captured.console.push(message.text());
  });
  return captured;
}

async function resetMock(
  request: APIRequestContext,
  persona: Persona,
  options: { serviceAccess503?: boolean; runtime402?: boolean } = {},
): Promise<void> {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`, {
    data: { persona, ...options },
  });
  expect(response.ok()).toBe(true);
}

async function login(page: Page): Promise<void> {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18800000001", code: "" },
  });
  expect(response.ok()).toBe(true);
}

async function setupPersona(
  page: Page,
  request: APIRequestContext,
  persona: Persona,
  options: { serviceAccess503?: boolean; runtime402?: boolean } = {},
): Promise<void> {
  await resetMock(request, persona, options);
  await login(page);
}

async function readState(request: APIRequestContext): Promise<MockState> {
  const response = await request.get(`${mockBackendBaseUrl}/__test/state`);
  expect(response.ok()).toBe(true);
  return await response.json() as MockState;
}

function requestCount(state: MockState, method: string, path: string): number {
  return state.requestCounts[`${method} ${path}`] ?? 0;
}

function expectOnlyFirstPageQueries(
  state: MockState,
  method: string,
  path: string,
): void {
  const queries = state.requestQueries[`${method} ${path}`] ?? [];
  expect(queries.length).toBeGreaterThan(0);
  expect([...new Set(queries)]).toEqual(["?page=1&pageSize=20"]);
}

async function expectInvalidPaginationRejected(
  request: APIRequestContext,
): Promise<void> {
  const invalidUrls = [
    "/billing/service-trials",
    "/billing/service-products?page=2&pageSize=20",
    "/billing/service-orders?page=1",
  ];
  for (const path of invalidUrls) {
    const response = await request.get(`${mockBackendBaseUrl}${path}`);
    expect(response.status()).toBe(400);
  }

  const state = await readState(request);
  expect(state.unexpectedRequests).toEqual(
    invalidUrls.map((path) => `GET ${path}`),
  );
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

async function expectBlockedPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/service-access$/);
  await expect(
    page.getByRole("heading", { level: 1, name: blockedTitle }),
  ).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
}

test.beforeEach(async ({ page, request }) => {
  browserErrors = captureBrowserErrors(page);
  await setupPersona(page, request, personas.blockedAdmin);
});

test.afterEach(async () => {
  expect(browserErrors.page).toEqual([]);
  expect(browserErrors.console).toEqual([]);
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
  await expect(page.getByText(expiredCopy, { exact: true })).toHaveCount(0);
  await expectCleanMockState(request, {
    "GET /employee/service-access": 2,
  });
});

test("有权限管理员可提交试用并发起受控购买跳转", async ({ page, request }) => {
  await expectInvalidPaginationRejected(request);
  await setupPersona(page, request, personas.blockedAdmin);
  const trialList = await request.get(
    `${mockBackendBaseUrl}/billing/service-trials?page=1&pageSize=20`,
  );
  expect(trialList.ok()).toBe(true);

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
  await expect(page.getByText("试用申请已提交，请等待平台审核。"))
    .toBeVisible();

  await expect(page.getByText("平台技术服务一年版")).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近服务订单" }))
    .toBeVisible();
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

test("阻断状态仍可访问计费恢复页", async ({ page, request }) => {
  await page.goto("/billing");
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole("heading", { name: "计费账户", level: 1 }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: blockedTitle }))
    .toHaveCount(0);
  await expectCleanMockState(request, {
    "GET /billing/summary": 2,
    "GET /billing/feature-estimates": 2,
    "GET /billing/ledger": 2,
  });
});

test("宽限期停留在项目页且只显示一个只读横幅", async ({ page, request }) => {
  await setupPersona(page, request, personas.graceTenant);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects(?:\?.*)?$/);
  await expect(page.getByText("只读宽限期", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "项目管理", level: 1 }))
    .toHaveCount(1);
  await expectCleanMockState(request, {
    "GET /employee/service-access": 2,
    "GET /projects": 3,
  });
});

test("正常租户与平台管理员都留在项目页", async ({ page, request }) => {
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

  await setupPersona(page, request, personas.platformAdmin);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "当前为平台管理模式" }))
    .toHaveCount(1);
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
      const requestUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      const method = (
        init?.method
        ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const url = new URL(requestUrl, window.location.origin);
      if (method !== "POST" || url.pathname !== "/api/backend/projects") {
        return nativeFetch(input, init);
      }

      url.searchParams.set("__e2eSynthetic402", "1");
      const response = await nativeFetch(url, init);
      const payload = await response.clone().json().catch(() => null) as {
        code?: unknown;
      } | null;
      if (payload?.code !== "TENANT_SERVICE_ACCESS_EXPIRED") return response;
      return new Response(response.body, {
        status: 402,
        statusText: "Payment Required",
        headers: response.headers,
      });
    };
    window.fetch = Object.assign(interceptedFetch, {
      preconnect: nativeFetch.preconnect,
    });
  });
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "项目管理", level: 1 }))
    .toHaveCount(1);
  const protectedEntryHistoryLength = await page.evaluate(
    () => window.history.length,
  );

  const runtimeNavigationPaths: string[] = [];
  page.on("request", (browserRequest) => {
    if (!browserRequest.isNavigationRequest()) return;
    runtimeNavigationPaths.push(new URL(browserRequest.url()).pathname);
  });
  await page.getByRole("button", { name: "新增项目" }).click();
  await page.getByLabel("项目名称").fill("运行时 402 回归项目");
  await page.getByRole("button", { name: "创建项目" }).click();
  await expectBlockedPage(page);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => window.history.length))
    .toBe(protectedEntryHistoryLength);

  const state = await expectCleanMockState(request, {
    "POST /projects": 1,
    "GET /employee/service-access": 3,
  });
  expect(requestCount(state, "POST", "/projects")).toBe(1);
  expect(state.runtime402Remaining).toBe(0);
  expect(state.runtimeBlocked).toBe(true);
  expect(runtimeNavigationPaths.filter((path) => path === "/service-access"))
    .toHaveLength(1);

  const navigationCountBeforeBack = runtimeNavigationPaths.length;
  await page.goBack({ waitUntil: "domcontentloaded" });
  expect(runtimeNavigationPaths.slice(navigationCountBeforeBack))
    .not.toContain("/projects");
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
